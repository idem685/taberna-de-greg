'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useGameStore } from '@/store/game-store';
import { type QuestStatus } from '@/lib/game-types';
import { 
  ScrollText, Star, CheckCircle2, Circle, Target, 
  Coins, Swords, ChevronDown, ChevronUp, Flag,
  Trophy, Clock, ListChecks
} from 'lucide-react';

const STATUS_CONFIG: Record<QuestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active: { label: 'Activa', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <Target className="w-3 h-3" /> },
  optional: { label: 'Opcional', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: <Circle className="w-3 h-3" /> },
  completed: { label: 'Completada', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: 'Fallida', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <Swords className="w-3 h-3" /> },
};

const DEFAULT_STATUS_CONFIG = { label: 'Desconocida', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: <Circle className="w-3 h-3" /> };

export default function Quests() {
  const { game, followQuest } = useGameStore();
  const [expandedQuest, setExpandedQuest] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | QuestStatus>('all');

  const quests = game.quests;
  const activeQuests = quests.filter((q) => q.status === 'active');
  const optionalQuests = quests.filter((q) => q.status === 'optional');
  const completedQuests = quests.filter((q) => q.status === 'completed');
  const failedQuests = quests.filter((q) => q.status === 'failed');

  const filteredQuests = filter === 'all' ? quests : quests.filter((q) => q.status === filter);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          Misiones
        </h2>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-xs">
            {activeQuests.length} activas
          </Badge>
          <Badge variant="outline" className="text-xs">
            {completedQuests.length} completadas
          </Badge>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'Todas' },
          { key: 'active', label: 'Activas' },
          { key: 'optional', label: 'Opcionales' },
          { key: 'completed', label: 'Completadas' },
          { key: 'failed', label: 'Fallidas' },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            className="text-xs shrink-0"
            onClick={() => setFilter(f.key as typeof filter)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Quest list */}
      {filteredQuests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ListChecks className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No hay misiones {filter !== 'all' ? 'en esta categoría' : 'todavía'}</p>
          <p className="text-xs mt-1">Explora el mundo para descubrir misiones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuests.map((quest) => {
            const statusConfig = STATUS_CONFIG[quest.status as QuestStatus] ?? DEFAULT_STATUS_CONFIG;
            const isExpanded = expandedQuest === quest.id;

            return (
              <Card key={quest.id} className={`transition-all ${quest.followed ? 'border-primary/50 shadow-sm' : ''}`}>
                <CardContent className="p-3">
                  {/* Quest header - clickable */}
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedQuest(isExpanded ? null : quest.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-[10px] ${statusConfig.color}`}>
                            {statusConfig.icon}
                            <span className="ml-1">{statusConfig.label}</span>
                          </Badge>
                          {quest.followed && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                              <Star className="w-2.5 h-2.5 mr-0.5" />
                              Siguiendo
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-sm">{quest.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {quest.description}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3 animate-fade-in">
                      <Separator />

                      {/* Level & rewards */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Flag className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Nivel rec.:</span>
                          <span className="font-medium">{quest.recommendedLevel}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Trophy className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">XP:</span>
                          <span className="font-medium">{quest.experienceReward}</span>
                        </div>
                        {quest.coinReward && (
                          <div className="flex items-center gap-1">
                            <Coins className="w-3 h-3 text-gold" />
                            <span className="text-muted-foreground">Monedas:</span>
                            <span className="font-medium">{quest.coinReward}</span>
                          </div>
                        )}
                      </div>

                      {/* Objectives */}
                      {quest.objectives.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 flex items-center gap-1">
                            <ListChecks className="w-3 h-3" />
                            Objetivos
                          </div>
                          <div className="space-y-1">
                            {quest.objectives.map((obj, i) => {
                              const completed = quest.completedObjectives.includes(obj);
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  {completed ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                  ) : (
                                    <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  )}
                                  <span className={completed ? 'line-through text-muted-foreground' : ''}>
                                    {obj}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Item rewards */}
                      {quest.itemRewards.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1">Recompensas de objetos</div>
                          <div className="flex flex-wrap gap-1">
                            {quest.itemRewards.map((item, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Follow button */}
                      {quest.status === 'active' && (
                        <Button
                          variant={quest.followed ? 'default' : 'outline'}
                          size="sm"
                          className="w-full gap-1"
                          onClick={() => followQuest(quest.id)}
                        >
                          <Star className="w-3 h-3" />
                          {quest.followed ? 'Dejar de seguir' : 'Seguir misión'}
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
