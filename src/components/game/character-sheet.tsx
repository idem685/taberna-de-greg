'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useGameStore } from '@/store/game-store';
import { getModifier, formatModifier, type AbilityScore, SKILL_MAP } from '@/lib/game-types';
import { 
  Heart, Shield, Zap, Footprints, Sword, 
  TrendingUp, Moon, Sun, Skull, Star, 
  ChevronUp, ChevronDown, Activity 
} from 'lucide-react';
import { toast } from 'sonner';

const ABILITY_INFO: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
  strength: { name: 'Fuerza', icon: <Sword className="w-4 h-4" />, color: 'text-red-500' },
  dexterity: { name: 'Destreza', icon: <Zap className="w-4 h-4" />, color: 'text-green-500' },
  constitution: { name: 'Constitución', icon: <Heart className="w-4 h-4" />, color: 'text-orange-500' },
  intelligence: { name: 'Inteligencia', icon: <Star className="w-4 h-4" />, color: 'text-blue-500' },
  wisdom: { name: 'Sabiduría', icon: <Sun className="w-4 h-4" />, color: 'text-yellow-500' },
  charisma: { name: 'Carisma', icon: <Activity className="w-4 h-4" />, color: 'text-purple-500' },
};

export default function CharacterSheet() {
  const { game, restCharacter, levelUp } = useGameStore();
  const character = game.character;

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">Crea un personaje para ver su hoja</p>
      </div>
    );
  }

  const hpPercent = character.maxHp > 0 ? (character.currentHp / character.maxHp) * 100 : 0;
  const xpPercent = character.experienceToNext > 0 ? (character.experience / character.experienceToNext) * 100 : 0;
  const canLevelUp = character.experience >= character.experienceToNext;

  const handleRest = (longRest: boolean) => {
    restCharacter(longRest);
    toast.success(longRest ? 'Descanso largo completado - Vida restaurada' : 'Descanso corto completado - Dados de golpe gastados');
  };

  const handleLevelUp = () => {
    levelUp();
    toast.success(`¡Has subido a nivel ${character.level + 1}!`);
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{character.name}</h2>
              <p className="text-sm text-muted-foreground">
                {character.race} • {character.class}{character.subclass ? ` (${character.subclass})` : ''}
              </p>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-lg px-3 py-1">
                Nv. {character.level}
              </Badge>
            </div>
          </div>

          {/* HP Bar */}
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <Heart className="w-4 h-4 text-hp" />
                Puntos de Vida
              </span>
              <span className="font-mono font-bold">
                {character.currentHp}/{character.maxHp}
                {character.temporaryHp > 0 && <span className="text-blue-400"> (+{character.temporaryHp} temp)</span>}
              </span>
            </div>
            <Progress value={hpPercent} className="h-3" />
          </div>

          {/* XP Bar */}
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-xp" />
                Experiencia
              </span>
              <span className="font-mono text-xs">
                {character.experience}/{character.experienceToNext} XP
              </span>
            </div>
            <Progress value={xpPercent} className="h-2" />
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <Shield className="w-4 h-4 mx-auto mb-1 text-primary" />
              <div className="text-lg font-bold">{character.armorClass}</div>
              <div className="text-xs text-muted-foreground">CA</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <Zap className="w-4 h-4 mx-auto mb-1 text-green-500" />
              <div className="text-lg font-bold">{formatModifier(character.initiative)}</div>
              <div className="text-xs text-muted-foreground">Iniciativa</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <Footprints className="w-4 h-4 mx-auto mb-1 text-blue-500" />
              <div className="text-lg font-bold">{character.speed}</div>
              <div className="text-xs text-muted-foreground">Velocidad</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <Star className="w-4 h-4 mx-auto mb-1 text-yellow-500" />
              <div className="text-lg font-bold">+{character.proficiencyBonus}</div>
              <div className="text-xs text-muted-foreground">Competencia</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 gap-1"
              onClick={() => handleRest(false)}
            >
              <Sun className="w-3 h-3" />
              Descanso corto
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 gap-1"
              onClick={() => handleRest(true)}
            >
              <Moon className="w-3 h-3" />
              Descanso largo
            </Button>
            {canLevelUp && (
              <Button 
                size="sm" 
                className="flex-1 gap-1"
                onClick={handleLevelUp}
              >
                <ChevronUp className="w-3 h-3" />
                Subir nivel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ability Scores */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Puntuaciones de Características</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(character.abilityScores).map(([key, value]) => {
              const info = ABILITY_INFO[key];
              const mod = getModifier(value);
              const isProficientSave = character.savingThrows[key as AbilityScore];
              return (
                <div key={key} className="text-center p-2 rounded-lg border bg-card">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {info.icon}
                    <span className="text-xs font-medium">{info.name}</span>
                  </div>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className={`text-sm font-mono ${mod >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatModifier(mod)}
                  </div>
                  {isProficientSave && (
                    <Badge variant="secondary" className="text-[10px] mt-1">
                      Salv. competente
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Saving Throws */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Tiradas de Salvación</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(character.savingThrows).map(([key, proficient]) => {
              const mod = getModifier(character.abilityScores[key as AbilityScore]);
              const total = proficient ? mod + character.proficiencyBonus : mod;
              return (
                <div key={key} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/50">
                  <span className="flex items-center gap-1">
                    {proficient && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    {ABILITY_INFO[key]?.name || key}
                  </span>
                  <span className={`font-mono font-bold ${total >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatModifier(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Habilidades</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-0.5">
            {character.skills.map((skill) => {
              const abilityMod = getModifier(character.abilityScores[skill.ability]);
              const total = skill.proficient
                ? abilityMod + character.proficiencyBonus + (skill.expertise ? character.proficiencyBonus : 0)
                : abilityMod;
              return (
                <div key={skill.key} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/50">
                  <span className="flex items-center gap-1.5">
                    {skill.proficient && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    {skill.expertise && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                    <span>{skill.name}</span>
                    <span className="text-muted-foreground">({ABILITY_INFO[skill.ability]?.name?.substring(0, 3)})</span>
                  </span>
                  <span className={`font-mono font-bold ${total >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatModifier(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Death Saves & Conditions */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Estado</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          {/* Death Saves */}
          <div>
            <div className="text-xs font-medium mb-1 flex items-center gap-1">
              <Skull className="w-3 h-3" />
              Salvaciones de Muerte
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Éxitos:</span>
                {[1, 2, 3].map((i) => (
                  <span
                    key={`success-${i}`}
                    className={`w-4 h-4 rounded-full border-2 ${i <= character.deathSaves.successes ? 'bg-green-500 border-green-500' : 'border-muted-foreground/30'}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Fallos:</span>
                {[1, 2, 3].map((i) => (
                  <span
                    key={`failure-${i}`}
                    className={`w-4 h-4 rounded-full border-2 ${i <= character.deathSaves.failures ? 'bg-red-500 border-red-500' : 'border-muted-foreground/30'}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Conditions */}
          {character.conditions.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Condiciones</div>
              <div className="flex flex-wrap gap-1">
                {character.conditions.map((condition, i) => (
                  <Badge key={i} variant="destructive" className="text-xs">
                    {condition}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Hit Dice */}
          <div>
            <div className="text-xs font-medium mb-1">Dados de Golpe</div>
            <span className="text-sm font-mono">
              {character.hitDiceRemaining}/{character.level} ({character.hitDice})
            </span>
          </div>

          {/* Backstory */}
          {character.backstory && (
            <div>
              <div className="text-xs font-medium mb-1">Trasfondo</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {character.backstory}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
