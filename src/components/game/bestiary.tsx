'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useGameStore } from '@/store/game-store';
import { getModifier, formatModifier } from '@/lib/game-types';
import { 
  BookOpen, Skull, Swords, Shield, Zap, 
  Flame, Snowflake, Bug, ChevronDown, ChevronUp,
  Target, Heart, Trophy, Eye
} from 'lucide-react';

export default function Bestiary() {
  const { game } = useGameStore();
  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);

  const monsters = game.bestiary.filter((m) => m.discovered);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Bestiario
        </h2>
        <Badge variant="outline" className="text-xs">
          {monsters.length} criaturas descubiertas
        </Badge>
      </div>

      {/* Monster list */}
      {monsters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bug className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Bestiario vacío</p>
          <p className="text-xs mt-1">Los monstruos que encuentres se registrarán aquí</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monsters.map((monster) => {
            const isExpanded = expandedMonster === monster.id;

            return (
              <Card key={monster.id}>
                <CardContent className="p-3">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedMonster(isExpanded ? null : monster.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Skull className="w-4 h-4 text-red-500" />
                          <h3 className="font-medium text-sm">{monster.name}</h3>
                          <Badge variant="outline" className="text-[10px]">
                            Nv. {monster.level}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {monster.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {monster.defeatCount > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            x{monster.defeatCount} derrotado{monster.defeatCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 animate-fade-in">
                      <Separator />

                      {/* Quick stats */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <Heart className="w-4 h-4 mx-auto mb-0.5 text-red-500" />
                          <div className="text-sm font-bold">{monster.hp}</div>
                          <div className="text-[10px] text-muted-foreground">HP</div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <Shield className="w-4 h-4 mx-auto mb-0.5 text-blue-500" />
                          <div className="text-sm font-bold">{monster.armorClass}</div>
                          <div className="text-[10px] text-muted-foreground">CA</div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <Trophy className="w-4 h-4 mx-auto mb-0.5 text-yellow-500" />
                          <div className="text-sm font-bold">{monster.experienceReward}</div>
                          <div className="text-[10px] text-muted-foreground">XP</div>
                        </div>
                      </div>

                      {/* Ability Scores */}
                      <div>
                        <div className="text-xs font-medium mb-1 flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          Puntuaciones
                        </div>
                        <div className="grid grid-cols-6 gap-1 text-center text-xs">
                          {Object.entries(monster.abilityScores).map(([key, value]) => (
                            <div key={key} className="p-1 rounded bg-muted/30">
                              <div className="text-[10px] text-muted-foreground uppercase">{key.substring(0, 3)}</div>
                              <div className="font-bold">{value}</div>
                              <div className="text-[10px] text-muted-foreground">{formatModifier(getModifier(value))}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Weaknesses */}
                      {monster.weaknesses.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 flex items-center gap-1">
                            <Flame className="w-3 h-3 text-orange-500" />
                            Debilidades
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {monster.weaknesses.map((w, i) => (
                              <Badge key={i} className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/20">
                                {w}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resistances */}
                      {monster.resistances.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 flex items-center gap-1">
                            <Snowflake className="w-3 h-3 text-blue-500" />
                            Resistencias
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {monster.resistances.map((r, i) => (
                              <Badge key={i} className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Immunities */}
                      {monster.immunities.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1 flex items-center gap-1">
                            <Shield className="w-3 h-3 text-gray-500" />
                            Inmunidades
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {monster.immunities.map((imm, i) => (
                              <Badge key={i} className="text-[10px] bg-gray-500/10 text-gray-600 border-gray-500/20">
                                {imm}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Loot */}
                      {monster.loot.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1">Botín</div>
                          <div className="flex flex-wrap gap-1">
                            {monster.loot.map((l, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {l}
                              </Badge>
                            ))}
                          </div>
                        </div>
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
