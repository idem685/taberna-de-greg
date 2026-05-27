'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGameStore } from '@/store/game-store';
import { type Character, type Item, type Quest, type NPC, type Currency, type SkillKey, SKILL_MAP, HIT_DIE_AVERAGE, transformKeysDeep } from '@/lib/game-types';
import { fetchJSON, APIError, sanitizeAIResponse } from '@/lib/api-utils';
import { sanitizeCurrency, parseCoinString, GameEngine } from '@/lib/game-engine';
import { toast } from 'sonner';
import { Swords, Sparkles, Shield, Wand2, Footprints, ArrowRight, Loader2, Dices, AlertTriangle, RefreshCw } from 'lucide-react';

const EXAMPLE_DESCRIPTIONS = [
  'Tharion, un elfo que abandonó su bosque después de lo que vio en el claro. No habla de eso. Su arco es lo único que no ha perdido.',
  'Grimjaw, un semi-orco que dejó su tribu por razones que prefiere olvidar. Fuerte como un oso, pero algo se quebró dentro.',
  'Luna, una tiefling que hizo un pacto con algo del Abismo. Busca deshacerlo, pero cada noche el pacto le susurra que no quiere ser deshecho.',
  'Borin MartillodeHierro, un enano clérigo cuya fe tambalea. Forja armas para otros porque ya no confía en la suya propia.',
  'Aria, una humana pícara que robó la cosa equivocada al hombre equivocado. Ahora hay sombras que la siguen y no duerme bien.',
];

const AI_REQUEST_TIMEOUT = 120000; // 2 minutes timeout for AI requests

/** Create a basic fallback character when AI fails completely */
function createFallbackCharacter(description: string): {
  character: Character;
  startingInventory: Item[];
  startingCurrency: Currency;
  initialQuest: Quest;
  initialNPCs: NPC[];
  openingNarrative: string;
} {
  // Try to extract a name from the description
  const nameMatch = description.match(/(?:llamado|nombre\s+(?:es|sea))?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/);
  const name = nameMatch?.[1] || 'Aventurero';
  
  // Determine a rough class from the description
  const desc = description.toLowerCase();
  let charClass = 'Guerrero';
  let hitDice = '1d10';
  let primaryAbility = 'strength';
  if (desc.match(/mago|hechicero|wizard|sorcerer|arcano/)) { charClass = 'Mago'; hitDice = '1d6'; primaryAbility = 'intelligence'; }
  else if (desc.match(/pícaro|rogue|sigilo|ladrón|ladrona/)) { charClass = 'Pícaro'; hitDice = '1d8'; primaryAbility = 'dexterity'; }
  else if (desc.match(/clérigo|clerigo|sacerdote|curandero/)) { charClass = 'Clérigo'; hitDice = '1d8'; primaryAbility = 'wisdom'; }
  else if (desc.match(/bárbaro|barbaro|furia/)) { charClass = 'Bárbaro'; hitDice = '1d12'; primaryAbility = 'strength'; }
  else if (desc.match(/ranger|explorador|bosque/)) { charClass = 'Ranger'; hitDice = '1d10'; primaryAbility = 'dexterity'; }
  else if (desc.match(/bardo|músico|cantante/)) { charClass = 'Bardo'; hitDice = '1d8'; primaryAbility = 'charisma'; }
  else if (desc.match(/bruja|warlock|pacto/)) { charClass = 'Brujo'; hitDice = '1d8'; primaryAbility = 'charisma'; }
  else if (desc.match(/paladín|paladin|sagrado/)) { charClass = 'Paladín'; hitDice = '1d10'; primaryAbility = 'charisma'; }
  else if (desc.match(/monje|monk|monasterio/)) { charClass = 'Monje'; hitDice = '1d8'; primaryAbility = 'dexterity'; }
  else if (desc.match(/druida|druid|naturaleza/)) { charClass = 'Druida'; hitDice = '1d8'; primaryAbility = 'wisdom'; }

  // Determine race
  let race = 'Humano';
  if (desc.match(/elfo|elfa|elven/)) race = 'Elfo';
  else if (desc.match(/enano|dwarf/)) race = 'Enano';
  else if (desc.match(/semi-orco|half-orc|orco/)) race = 'Semi-orco';
  else if (desc.match(/tiefling|tief/)) race = 'Tiefling';
  else if (desc.match(/halfling|mediano/)) race = 'Halfling';
  else if (desc.match(/gnomo|gnome/)) race = 'Gnomo';
  else if (desc.match(/dracónido|dragonborn/)) race = 'Dracónido';

  // Build ability scores based on class priority
  const scores = {
    strength: 10, dexterity: 10, constitution: 10,
    intelligence: 10, wisdom: 10, charisma: 10,
  };
  // Apply 27-point-buy style distribution
  const distributions: Record<string, Partial<typeof scores>> = {
    strength: { strength: 15, constitution: 14, dexterity: 12, wisdom: 10, intelligence: 8, charisma: 10 },
    dexterity: { dexterity: 15, constitution: 14, strength: 12, wisdom: 10, intelligence: 8, charisma: 10 },
    intelligence: { intelligence: 15, constitution: 14, dexterity: 12, wisdom: 10, strength: 8, charisma: 10 },
    wisdom: { wisdom: 15, constitution: 14, dexterity: 12, strength: 10, intelligence: 8, charisma: 10 },
    charisma: { charisma: 15, constitution: 14, dexterity: 12, wisdom: 10, intelligence: 8, strength: 10 },
  };
  Object.assign(scores, distributions[primaryAbility] || distributions.strength);

  // Skills based on class
  const classSkills: Record<string, string[]> = {
    Mago: ['arcana', 'history', 'investigation', 'religion'],
    Pícaro: ['acrobatics', 'stealth', 'sleightOfHand', 'perception'],
    Guerrero: ['athletics', 'intimidation', 'perception', 'survival'],
    Clérigo: ['insight', 'medicine', 'persuasion', 'religion'],
    Bárbaro: ['athletics', 'intimidation', 'nature', 'survival'],
    Ranger: ['animalHandling', 'nature', 'perception', 'stealth'],
    Bardo: ['deception', 'persuasion', 'performance', 'insight'],
    Brujo: ['arcana', 'deception', 'intimidation', 'investigation'],
    Paladín: ['athletics', 'insight', 'intimidation', 'persuasion'],
    Monje: ['acrobatics', 'athletics', 'insight', 'stealth'],
    Druida: ['animalHandling', 'nature', 'perception', 'medicine'],
  };
  const proficientSkills = classSkills[charClass] || classSkills.Guerrero;

  const allSkills = Object.entries(SKILL_MAP).map(([key, val]) => ({
    key: key as SkillKey,
    name: val.name,
    ability: val.ability,
    proficient: proficientSkills.includes(key),
    expertise: false,
  }));

  // Saving throws based on class
  const classSaves: Record<string, ('strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma')[]> = {
    Mago: ['intelligence', 'wisdom'],
    Pícaro: ['dexterity', 'intelligence'],
    Guerrero: ['strength', 'constitution'],
    Clérigo: ['wisdom', 'charisma'],
    Bárbaro: ['strength', 'constitution'],
    Ranger: ['strength', 'dexterity'],
    Bardo: ['dexterity', 'charisma'],
    Brujo: ['wisdom', 'charisma'],
    Paladín: ['wisdom', 'charisma'],
    Monje: ['strength', 'dexterity'],
    Druida: ['intelligence', 'wisdom'],
  };
  const saves = classSaves[charClass] || classSaves.Guerrero;
  const savingThrows = {
    strength: saves.includes('strength'),
    dexterity: saves.includes('dexterity'),
    constitution: saves.includes('constitution'),
    intelligence: saves.includes('intelligence'),
    wisdom: saves.includes('wisdom'),
    charisma: saves.includes('charisma'),
  };

  // HP calculation — uses GameEngine's formula (hit die average + CON mod)
  const conMod = Math.floor((scores.constitution - 10) / 2);
  const hitDieMap: Record<string, number> = HIT_DIE_AVERAGE;
  const maxHp = (hitDieMap[hitDice] || 6) + conMod;
  const dexMod = Math.floor((scores.dexterity - 10) / 2);

  return {
    character: {
      name,
      race,
      class: charClass,
      subclass: '',
      level: 1,
      currentHp: maxHp,
      maxHp,
      temporaryHp: 0,
      experience: 0,
      experienceToNext: 300,
      armorClass: 10 + dexMod,
      initiative: dexMod,
      speed: 30,
      proficiencyBonus: 2,
      abilityScores: scores,
      savingThrows,
      skills: allSkills,
      hitDice,
      hitDiceRemaining: 1,
      deathSaves: { successes: 0, failures: 0 },
      conditions: [],
      backstory: description,
    },
    startingInventory: [
      { id: 'fallback_weapon', name: 'Espada larga', description: 'Una espada larga de hierro', category: 'weapon' as const, rarity: 'common' as const, weight: 3, value: 1500, effect: '', equipped: true, equipSlot: 'weapon' as const, damage: '1d8', damageType: 'slashing', quantity: 1 },
      { id: 'fallback_armor', name: 'Armadura de cuero', description: 'Armadura básica de cuero', category: 'armor' as const, rarity: 'common' as const, weight: 10, value: 1000, effect: '', equipped: true, equipSlot: 'armor' as const, armorBonus: 1, quantity: 1 },
      { id: 'fallback_potion', name: 'Poción de curación', description: 'Una poción roja que restaura puntos de vida', category: 'potion' as const, rarity: 'common' as const, weight: 0.5, value: 500, effect: 'Restaura 2d4+2 PV', equipped: false, quantity: 2 },
    ],
    startingCurrency: { gold: 10, silver: 5, copper: 0 },
    initialQuest: {
      id: 'fallback_quest',
      name: 'El paquete de cuero',
      description: 'No recuerdas haber entrado. Greg sabe algo que no deberías haberle contado. Sobre la barra hay un paquete envuelto en cuero oscuro que dice que te pertenece — pero abrirlo significa renunciar a la puerta, y la puerta significa renunciar al paquete. No puedes hacer las dos cosas.',
      status: 'active' as const,
      recommendedLevel: '1-3',
      experienceReward: 75,
      coinReward: '0 oro',
      itemRewards: [],
      followed: true,
      objectives: ['Decide: abre el paquete o camina hacia la puerta', 'Descubre qué sabe Greg sobre ti'],
      completedObjectives: [],
    },
    initialNPCs: [
      {
        id: 'fallback_greg',
        name: 'Viejo Greg',
        race: 'Humano',
        location: 'Taberna del Viejo Greg',
        reputation: 'neutral' as const,
        reputationScore: 0,
        lastInteraction: 'Sabía que vendrías.',
        interactionHistory: ['Sabía que vendrías.'],
        notes: 'Dueño de la taberna. Sabe cosas que no debería saber. Su familiaridad es inquietante, no hospitalaria. Nadie entra aquí por voluntad propia.',
        alive: true,
      },
    ],
    openingNarrative: `*No recuerdas haber entrado.*

*Estás sentado en un rincón de la Taberna del Viejo Greg — lo sabes porque el nombre está tallado en el marco de la puerta, letras que parecen más antiguas que el edificio mismo— pero no recuerdas haberla cruzado. Tienes los dedos húmedos de lo que sea que estés bebiendo. Algo oscuro. Algo que no pediste.*

*La taberna está en silencio. Los otros parroquianos —tres, tal vez cuatro figuras encorvadas sobre sus mesas— no se mueven. No parpadean. Las velas arden sin vacilar, como si el aire hubiera olvidado cómo moverse.*

*Detrás de la barra, un hombre viejo te observa. Barba blanca, ojos claros como agua de río. Te sonríe, y en esa sonrisa hay algo que no debería estar: familiaridad. No la amabilidad de un posadero, sino el reconocimiento de alguien que te ha estado esperando.*

*"Sabía que vendrías, ${name}"*, dice, y su voz es más suave de lo que esperabas. *"No por la puerta. No por elección. Los que se sientan en esa silla nunca vienen por voluntad propia."*

*Deja un paquete sobre la barra. Pequeño. Envuelto en cuero oscuro, atado con un cordón que parece hecho de pelo.*

*"Hay algo que te pertenece. Algo que perdiste hace mucho, o que te fue quitado. Puedes abrirlo ahora, o puedes caminar hacia la puerta y descubrir qué hay al otro lado."* Hace una pausa. Sus ojos no parpadean. *"Pero no puedes hacer las dos cosas."*

*El silencio se espesa. Las figuras en las otras mesas no se han movido. Afuera —si es que hay un afuera— no se oye nada.*`,
  };
}

export default function CharacterCreation() {
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');
  const [lastError, setLastError] = useState('');
  const { setCharacter, addItem, addQuest, addNPC, addChatMessage, updateCurrency, updateNarrative } = useGameStore();

  /** Apply the parsed character creation data to the store via GameEngine-delegated actions */
  const applyCharacterData = useCallback((
    data: Record<string, unknown>
  ) => {
    // Apply character data (GameEngine.setCharacter validates and clamps)
    if (data.character) {
      setCharacter(data.character as Character);
    } else {
      console.error('No character data in response:', data);
      throw new Error('No se recibieron datos del personaje');
    }

    // Apply starting inventory (each addItem goes through GameEngine)
    const inventory = (data.startingInventory || data.starting_inventory) as Item[] | undefined;
    if (inventory && Array.isArray(inventory)) {
      for (const item of inventory) {
        addItem(item);
      }
    }

    // Apply starting currency (GameEngine.updateCurrency sanitizes)
    const currency = (data.startingCurrency || data.starting_currency) as Partial<Currency> | undefined;
    if (currency) {
      updateCurrency(currency);
    }

    // Apply initial quest
    const quest = (data.initialQuest || data.initial_quest) as Quest | undefined;
    if (quest) {
      addQuest(quest);
    }

    // Apply initial NPCs
    const npcs = (data.initialNPCs || data.initial_npcs) as NPC[] | undefined;
    if (npcs && Array.isArray(npcs)) {
      for (const npc of npcs) {
        addNPC(npc);
      }
    }

    // Add opening narrative as DM message
    const narrative = (data.openingNarrative || data.opening_narrative) as string | undefined;
    if (narrative) {
      addChatMessage({
        role: 'dm',
        content: narrative,
      });
    }

    updateNarrative({ turn: 1 });
  }, [setCharacter, addItem, addQuest, addNPC, addChatMessage, updateCurrency, updateNarrative]);

  const handleCreate = async () => {
    if (description.trim().length < 10) {
      toast.error('Describe mejor a tu personaje (mínimo 10 caracteres)');
      return;
    }

    setIsCreating(true);
    setLastError('');
    setCreationStatus('Greg te observa...');

    try {
      setCreationStatus('La silla espera...');

      const data = await fetchJSON<Record<string, unknown>>('/api/create-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
        timeout: AI_REQUEST_TIMEOUT,
      });

      setCreationStatus('El silencio se espesa...');

      // Transform keys in case backend didn't (safety net)
      const transformedData = transformKeysDeep(data) as Record<string, unknown>;
      // Sanitize AI data (fix "null" strings, etc.)
      const sanitizedData = sanitizeAIResponse(transformedData);

      // Validate the AI response has a character before applying
      if (!sanitizedData.character) {
        throw new APIError('El Dungeon Master no pudo crear tu personaje. Intenta con una descripción diferente.', 500, 'NO_CHARACTER');
      }

      applyCharacterData(sanitizedData);
      toast.success('La silla crujió bajo tu peso. Tu aventura comienza.');
    } catch (error: unknown) {
      console.error('Character creation error:', error);
      
      if (error instanceof APIError) {
        setLastError(error.message);
        toast.error(error.message);
      } else if (error instanceof SyntaxError) {
        // This catches the HTML-instead-of-JSON case if fetchJSON somehow misses it
        setLastError('Error de comunicación con el servidor. Intenta de nuevo o usa el modo rápido.');
        toast.error('Error de formato en la respuesta del servidor.');
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        setLastError('La creación tardó demasiado. Intenta de nuevo o usa el modo rápido.');
        toast.error('Tiempo de espera agotado. Intenta de nuevo.');
      } else {
        setLastError('Error al conectar con el Dungeon Master. Intenta de nuevo o usa el modo rápido.');
        toast.error('Error al conectar con el Dungeon Master.');
      }
    } finally {
      setIsCreating(false);
      setCreationStatus('');
    }
  };

  /** Create a fallback character without AI when it fails */
  const handleFallbackCreate = () => {
    try {
      const fallback = createFallbackCharacter(description);
      applyCharacterData(fallback as unknown as Record<string, unknown>);
      toast.success('Te sientas. Greg no parpadea. (Modo offline)');
    } catch (error) {
      console.error('Fallback creation error:', error);
      toast.error('Error al crear el personaje.');
    }
  };

  const handleExample = (desc: string) => {
    setDescription(desc);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-2xl space-y-6">
        {/* Title */}
        <div className="text-center space-y-2 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Swords className="w-10 h-10 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Taberna del Viejo Greg
            </h1>
            <Swords className="w-10 h-10 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
            Describe a tu personaje. Greg ya te está esperando.
          </p>
        </div>

        {/* Main creation card */}
        <Card className="border-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Dices className="w-5 h-5" />
              Crea tu Personaje
            </CardTitle>
            <CardDescription>
              Describe quién eres. La IA construirá tu hoja de personaje según D&D 5e.
              No mientas — Greg sabrá si lo haces.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Ej: Soy Tharion, un elfo que abandonó su bosque después de lo que vio en el claro. No hablo de eso. Mi arco es lo único que no he perdido..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] resize-none text-base"
              disabled={isCreating}
            />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {description.length} caracteres
                </span>
                <Button
                  onClick={handleCreate}
                  disabled={isCreating || description.trim().length < 10}
                  size="lg"
                  className="gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {creationStatus || 'Preparando...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Sentarse en la silla
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
              
              {/* Error message with fallback option */}
              {lastError && !isCreating && (
                <div className="flex flex-col gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 animate-fade-in">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{lastError}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={handleCreate}
                      disabled={description.trim().length < 10}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reintentar con IA
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={handleFallbackCreate}
                      disabled={description.trim().length < 10}
                    >
                      <Swords className="w-3 h-3" />
                      Modo rápido (sin IA)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Example descriptions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              Inspiración - Ejemplos rápidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {EXAMPLE_DESCRIPTIONS.map((desc, i) => (
                <button
                  key={i}
                  onClick={() => handleExample(desc)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors text-sm"
                  disabled={isCreating}
                >
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="shrink-0 mt-0.5 text-xs">
                      {i + 1}
                    </Badge>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-card border text-center">
            <Shield className="w-5 h-5 text-primary" />
            <span className="text-xs font-medium">D&D 5e</span>
            <span className="text-xs text-muted-foreground">Reglas crudas</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-card border text-center">
            <Swords className="w-5 h-5 text-primary" />
            <span className="text-xs font-medium">Viejo Greg</span>
            <span className="text-xs text-muted-foreground">Sabe demasiado</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-card border text-center">
            <Footprints className="w-5 h-5 text-primary" />
            <span className="text-xs font-medium">Consecuencias</span>
            <span className="text-xs text-muted-foreground">Permanentes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
