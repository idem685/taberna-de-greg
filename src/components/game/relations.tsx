'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useGameStore } from '@/store/game-store';
import { type Reputation } from '@/lib/game-types';
import { 
  Users, Search, MapPin, Heart, Skull, 
  MessageCircle, ChevronDown, ChevronUp,
  Frown, Meh, Smile, UserCheck, UserX,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';

const REPUTATION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  hostile: { label: 'Hostil', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <UserX className="w-3 h-3" /> },
  unfriendly: { label: 'Desconfiado', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: <Frown className="w-3 h-3" /> },
  neutral: { label: 'Neutral', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: <Meh className="w-3 h-3" /> },
  friendly: { label: 'Amistoso', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <Smile className="w-3 h-3" /> },
  allied: { label: 'Aliado', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <UserCheck className="w-3 h-3" /> },
};

const DEFAULT_REPUTATION_CONFIG = { label: 'Desconocido', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: <Meh className="w-3 h-3" /> };

export default function Relations() {
  const { game, setActiveTab, addChatMessage } = useGameStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNPC, setExpandedNPC] = useState<string | null>(null);

  const npcs = game.relations;

  const filteredNPCs = useMemo(() => {
    if (!searchQuery.trim()) return npcs;
    const q = searchQuery.toLowerCase();
    return npcs.filter(
      (npc) =>
        npc.name.toLowerCase().includes(q) ||
        npc.race.toLowerCase().includes(q) ||
        npc.location.toLowerCase().includes(q)
    );
  }, [npcs, searchQuery]);

  const handleTalkTo = (npcName: string) => {
    // Switch to chat tab and add a context message about the NPC
    setActiveTab('chat');
    // Add a system message hinting about the NPC
    addChatMessage({
      role: 'system',
      content: `Te acercas a hablar con ${npcName}...`,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Relaciones
        </h2>
        <Badge variant="outline" className="text-xs">
          {npcs.length} PNJs conocidos
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, raza o ubicación..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* NPC List */}
      {filteredNPCs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">
            {searchQuery ? 'No se encontraron PNJs' : 'Aún no conoces a nadie'}
          </p>
          <p className="text-xs mt-1">Explora el mundo para conocer personajes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNPCs.map((npc) => {
            const repConfig = REPUTATION_CONFIG[npc.reputation] ?? DEFAULT_REPUTATION_CONFIG;
            const isExpanded = expandedNPC === npc.id;

            return (
              <Card key={npc.id} className={!npc.alive ? 'opacity-60' : ''}>
                <CardContent className="p-3">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedNPC(isExpanded ? null : npc.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-sm">{npc.name}</h3>
                          {!npc.alive && (
                            <Badge variant="destructive" className="text-[10px]">
                              <Skull className="w-2.5 h-2.5 mr-0.5" />
                              Muerto
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{npc.race}</span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {npc.location}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge className={`text-[10px] ${repConfig.color}`}>
                          {repConfig.icon}
                          <span className="ml-0.5">{repConfig.label}</span>
                        </Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 animate-fade-in">
                      <Separator />

                      {/* Reputation score */}
                      <div>
                        <div className="text-xs font-medium mb-1 flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          Reputación: {npc.reputationScore}/100
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              npc.reputationScore >= 50
                                ? 'bg-green-500'
                                : npc.reputationScore >= 0
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${((npc.reputationScore + 100) / 200) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Last interaction */}
                      {npc.lastInteraction && (
                        <div>
                          <div className="text-xs font-medium mb-1">Última interacción</div>
                          <p className="text-xs text-muted-foreground italic">
                            &quot;{npc.lastInteraction}&quot;
                          </p>
                        </div>
                      )}

                      {/* Notes */}
                      {npc.notes && (
                        <div>
                          <div className="text-xs font-medium mb-1">Notas</div>
                          <p className="text-xs text-muted-foreground">{npc.notes}</p>
                        </div>
                      )}

                      {/* Interaction history */}
                      {npc.interactionHistory.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1">Historial de interacciones</div>
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {npc.interactionHistory.slice(-5).map((interaction, i) => (
                              <p key={i} className="text-xs text-muted-foreground italic">
                                &quot;{interaction}&quot;
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {npc.alive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1"
                          onClick={() => handleTalkTo(npc.name)}
                        >
                          <MessageCircle className="w-3 h-3" />
                          Hablar con {npc.name}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
