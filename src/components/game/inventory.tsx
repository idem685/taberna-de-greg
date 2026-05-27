'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useGameStore } from '@/store/game-store';
import { type ItemCategory, type ItemRarity, type Item, type Equipment } from '@/lib/game-types';
import { 
  Package, Coins, Sword, Shield, FlaskConical, Key, 
  Wrench, ChevronDown, ChevronUp, ArrowUpDown, 
  Plus, Minus, Hand, Star, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_CONFIG: Record<ItemCategory, { label: string; icon: React.ReactNode; color: string }> = {
  weapon: { label: 'Armas', icon: <Sword className="w-4 h-4" />, color: 'text-red-500' },
  armor: { label: 'Armaduras', icon: <Shield className="w-4 h-4" />, color: 'text-blue-500' },
  potion: { label: 'Pociones', icon: <FlaskConical className="w-4 h-4" />, color: 'text-green-500' },
  important: { label: 'Objetos importantes', icon: <Key className="w-4 h-4" />, color: 'text-yellow-500' },
  misc: { label: 'Varios', icon: <Wrench className="w-4 h-4" />, color: 'text-muted-foreground' },
};

const RARITY_CONFIG: Record<string, { label: string; class: string; border: string }> = {
  common: { label: 'Común', class: 'rarity-common', border: 'rarity-border-common' },
  uncommon: { label: 'Poco común', class: 'rarity-uncommon', border: 'rarity-border-uncommon' },
  rare: { label: 'Raro', class: 'rarity-rare', border: 'rarity-border-rare' },
  epic: { label: 'Épico', class: 'rarity-epic', border: 'rarity-border-epic' },
  legendary: { label: 'Legendario', class: 'rarity-legendary', border: 'rarity-border-legendary' },
};

const DEFAULT_RARITY_CONFIG = { label: 'Desconocido', class: 'rarity-common', border: 'rarity-border-common' };

const SLOT_LABELS: Record<string, string> = {
  weapon: 'Arma principal',
  armor: 'Armadura',
  shield: 'Escudo',
  accessory: 'Accesorio',
};

export default function Inventory() {
  const { game, equipItem, unequipItem, removeItem, consumeItem } = useGameStore();
  const [expandedCategory, setExpandedCategory] = useState<ItemCategory | 'equipment' | 'currency'>('equipment');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const inventory = game.inventory;
  const equipment = inventory.equipment;
  const items = inventory.items;
  const currency = inventory.currency;

  // Calculate total weight (safe against corrupt item data)
  const totalWeight = items.reduce((sum, item) => sum + (Number(item.weight) || 0) * (Number(item.quantity) || 1), 0);

  const handleEquip = (itemId: string) => {
    equipItem(itemId);
    toast.success('Objeto equipado');
  };

  const handleUnequip = (slot: keyof typeof equipment) => {
    unequipItem(slot);
    toast.success('Objeto desequipado');
  };

  const handleUseItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    consumeItem(itemId);
    if (item) toast.success(`Usaste: ${item.name}`);
  };

  const handleDrop = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    
    // Confirm before dropping rare+ items
    if (item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary') {
      if (!confirm(`¿Estás seguro de que quieres descartar "${item.name}"? Es un objeto ${(RARITY_CONFIG[item.rarity] ?? DEFAULT_RARITY_CONFIG).label} y no se puede recuperar fácilmente.`)) {
        return;
      }
    }
    
    removeItem(itemId);
    toast.success(`Descartaste: ${item.name}`);
  };

  const getItemsByCategory = (cat: ItemCategory) => items.filter((i) => i.category === cat && !i.equipped);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Inventario
        </h2>
        <span className="text-xs text-muted-foreground">
          {totalWeight}/{inventory.maxWeight} kg
        </span>
      </div>

      {/* Equipment Section */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Equipamiento Actual
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {(Object.entries(equipment) as [keyof Equipment, Item | null][]).map(([slot, item]) => (
            <div key={slot} className="flex items-center justify-between p-2 rounded-lg border">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24">{SLOT_LABELS[slot] ?? slot}</span>
                {item ? (
                  <div className="flex items-center gap-1">
                    <span className={`text-sm font-medium ${(RARITY_CONFIG[item.rarity] ?? DEFAULT_RARITY_CONFIG).class}`}>
                      {item.name}
                    </span>
                    {item.damage && (
                      <Badge variant="outline" className="text-[10px]">
                        {item.damage} {item.damageType}
                      </Badge>
                    )}
                    {item.armorBonus && item.armorBonus > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{item.armorBonus} CA
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Vacío</span>
                )}
              </div>
              {item && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => handleUnequip(slot as keyof typeof equipment)}
                >
                  <Minus className="w-3 h-3" />
                  Desequipar
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Currency */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium">{currency.gold}</span>
              <span className="text-xs text-muted-foreground">oro</span>
            </div>
            <div className="flex items-center gap-1">
              <Coins className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">{currency.silver}</span>
              <span className="text-xs text-muted-foreground">plata</span>
            </div>
            <div className="flex items-center gap-1">
              <Coins className="w-4 h-4 text-orange-700" />
              <span className="text-sm font-medium">{currency.copper}</span>
              <span className="text-xs text-muted-foreground">cobre</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category sections */}
      {(['weapon', 'armor', 'potion', 'important', 'misc'] as ItemCategory[]).map((cat) => {
        const catItems = getItemsByCategory(cat);
        const config = CATEGORY_CONFIG[cat];
        const isExpanded = expandedCategory === cat;

        return (
          <Card key={cat}>
            <CardHeader
              className="pb-1 pt-3 px-4 cursor-pointer"
              onClick={() => setExpandedCategory(isExpanded ? 'equipment' : cat)}
            >
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {config.icon}
                  {config.label}
                  <Badge variant="secondary" className="text-xs">
                    {catItems.length}
                  </Badge>
                </span>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </CardTitle>
            </CardHeader>
            {isExpanded && (
              <CardContent className="px-4 pb-3 animate-fade-in">
                {catItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Sin objetos</p>
                ) : (
                  <div className="space-y-1">
                    {catItems.map((item) => {
                      const rarityConfig = RARITY_CONFIG[item.rarity];
                      const isItemExpanded = expandedItem === item.id;

                      return (
                        <div
                          key={item.id}
                          className={`border rounded-lg p-2 ${rarityConfig.border}`}
                        >
                          <button
                            className="w-full text-left"
                            onClick={() => setExpandedItem(isItemExpanded ? null : item.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${rarityConfig.class}`}>
                                  {item.name}
                                </span>
                                {item.quantity > 1 && (
                                  <Badge variant="outline" className="text-[10px]">x{item.quantity}</Badge>
                                )}
                                <Badge variant="outline" className="text-[10px]">{rarityConfig.label}</Badge>
                              </div>
                              {isItemExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </div>
                          </button>

                          {isItemExpanded && (
                            <div className="mt-2 space-y-2 animate-fade-in">
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                              
                              <div className="flex flex-wrap gap-1 text-xs">
                                {item.damage && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Daño: {item.damage} {item.damageType}
                                  </Badge>
                                )}
                                {item.armorBonus && item.armorBonus > 0 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    +{item.armorBonus} CA
                                  </Badge>
                                )}
                                {item.effect && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Efecto: {item.effect}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px]">
                                  {item.weight} kg • {item.value} cp
                                </Badge>
                              </div>

                              <div className="flex gap-1">
                                {item.equipSlot && !item.equipped && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="text-xs h-7 gap-1"
                                    onClick={() => handleEquip(item.id)}
                                  >
                                    <Plus className="w-3 h-3" />
                                    Equipar
                                  </Button>
                                )}
                                {(cat === 'potion' || (cat === 'misc' && item.effect)) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 gap-1"
                                    onClick={() => handleUseItem(item.id)}
                                    aria-label={`Usar ${item.name}`}
                                  >
                                    <FlaskConical className="w-3 h-3" />
                                    Usar
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7 gap-1 text-destructive"
                                  onClick={() => handleDrop(item.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Descartar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
