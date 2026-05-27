'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useGameStore } from '@/store/game-store';
import { 
  BookOpen, Skull, MapPin, Clock, HelpCircle, 
  ChevronDown, ChevronUp, Swords, Heart, 
  User, Shield, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ally: { label: 'Aliado', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <Heart className="w-3 h-3" /> },
  enemy: { label: 'Enemigo', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <Swords className="w-3 h-3" /> },
  neutral: { label: 'Neutral', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: <User className="w-3 h-3" /> },
  player: { label: 'Jugador', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: <Shield className="w-3 h-3" /> },
};

const DEFAULT_ROLE_CONFIG = { label: 'Desconocido', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: <HelpCircle className="w-3 h-3" /> };

export default function BookOfDead() {
  const { game, updateDeathEntry } = useGameStore();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const entries = game.bookOfDead;

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Libro de Muertes
        </h2>
        <Badge variant="outline" className="text-xs">
          {entries.length} entradas
        </Badge>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground">
        Registro de todas las muertes que has presenciado o de las que tienes conocimiento.
      </p>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Skull className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Nadie ha muerto... todavía</p>
          <p className="text-xs mt-1">Las muertes que presencies se registrarán aquí</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const roleConfig = ROLE_CONFIG[entry.role] ?? DEFAULT_ROLE_CONFIG;
            const isExpanded = expandedEntry === entry.id;

            return (
              <Card key={entry.id} className={!entry.confirmed ? 'border-dashed' : ''}>
                <CardContent className="p-3">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Skull className={`w-4 h-4 ${entry.confirmed ? 'text-red-500' : 'text-yellow-500'}`} />
                          <h3 className="font-medium text-sm">{entry.name}</h3>
                          <Badge className={`text-[10px] ${roleConfig.color}`}>
                            {roleConfig.icon}
                            <span className="ml-0.5">{roleConfig.label}</span>
                          </Badge>
                          {!entry.confirmed && (
                            <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500/30">
                              <HelpCircle className="w-2.5 h-2.5 mr-0.5" />
                              No confirmado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {entry.causeOfDeath}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 animate-fade-in">
                      <Separator />

                      {/* Death details */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Lugar:</span>
                          <span>{entry.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Día {entry.day}, Turno {entry.turn}</span>
                        </div>
                      </div>

                      {/* Cause of death */}
                      <div>
                        <div className="text-xs font-medium mb-1">Causa de muerte</div>
                        <p className="text-xs text-muted-foreground">{entry.causeOfDeath}</p>
                      </div>

                      {/* Elegy */}
                      {entry.elegy && (
                        <div>
                          <div className="text-xs font-medium mb-1">Elegía</div>
                          <p className="text-xs text-muted-foreground italic leading-relaxed">
                            &quot;{entry.elegy}&quot;
                          </p>
                        </div>
                      )}

                      {/* Confirm/Unconfirm */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1 text-xs"
                        onClick={() => {
                          updateDeathEntry(entry.id, { confirmed: !entry.confirmed });
                          toast.success(entry.confirmed ? 'Marcado como incierto' : 'Muerte confirmada');
                        }}
                      >
                        {entry.confirmed ? (
                          <>
                            <HelpCircle className="w-3 h-3" />
                            Marcar como incierto
                          </>
                        ) : (
                          <>
                            <Skull className="w-3 h-3" />
                            Confirmar muerte
                          </>
                        )}
                      </Button>
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
