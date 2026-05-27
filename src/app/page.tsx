'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/game-store';
import CharacterCreation from '@/components/game/character-creation';
import Chat from '@/components/game/chat';
import CharacterSheet from '@/components/game/character-sheet';
import Quests from '@/components/game/quests';
import Inventory from '@/components/game/inventory';
import Relations from '@/components/game/relations';
import Bestiary from '@/components/game/bestiary';
import BookOfDead from '@/components/game/book-of-dead';
import DebugPanel from '@/components/game/debug-panel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare,
  User,
  ScrollText,
  Package,
  Users,
  BookOpen,
  Skull,
  Sun,
  Moon,
  Download,
  Upload,
  Trash2,
  MoreVertical,
  Swords,
  Menu,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const TABS = [
  { id: 'chat', label: 'Aventura', icon: MessageSquare },
  { id: 'character', label: 'Personaje', icon: User },
  { id: 'quests', label: 'Misiones', icon: ScrollText },
  { id: 'inventory', label: 'Inventario', icon: Package },
  { id: 'relations', label: 'Relaciones', icon: Users },
  { id: 'bestiary', label: 'Bestiario', icon: BookOpen },
  { id: 'bookOfDead', label: 'Muertes', icon: Skull },
];

export default function HomePage() {
  const {
    game,
    activeTab,
    setActiveTab,
    isCharacterCreated,
    exportGame,
    importGame,
    newGame,
    saveCurrentGame,
    saves,
  } = useGameStore();

  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('taberna-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return saved ? saved === 'dark' : prefersDark;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Apply dark mode class on mount and when isDark changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Close mobile menu on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('taberna-theme', newDark ? 'dark' : 'light');
  };

  // Export game
  const handleExport = () => {
    const json = exportGame();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taberna-${game.character?.name || 'partida'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Partida exportada');
  };

  // Import game
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        const json = re.target?.result as string;
        const success = importGame(json);
        if (success) {
          toast.success('Partida importada correctamente');
        } else {
          toast.error('Error al importar la partida. Archivo inválido.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // New game
  const handleNewGame = () => {
    if (confirm('¿Estás seguro de que quieres empezar una nueva partida? Se perderá el progreso actual si no lo has exportado.')) {
      newGame();
      toast.success('Nueva partida iniciada');
    }
  };

  // Save game
  const handleSave = () => {
    saveCurrentGame();
    toast.success('Partida guardada');
  };

  // If no character created, show creation screen
  if (!isCharacterCreated) {
    return (
      <div className="min-h-screen bg-background">
        <CharacterCreation />
      </div>
    );
  }

  // Render active tab content
  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <Chat />;
      case 'character':
        return <CharacterSheet />;
      case 'quests':
        return <Quests />;
      case 'inventory':
        return <Inventory />;
      case 'relations':
        return <Relations />;
      case 'bestiary':
        return <Bestiary />;
      case 'bookOfDead':
        return <BookOfDead />;
      default:
        return <Chat />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top header bar */}
      <header className="flex items-center justify-between px-3 py-2 border-b bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-sm md:text-base truncate">
            Taberna del Viejo Greg
          </h1>
          {game.character && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              — {game.character.name} (Nv.{game.character.level})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Desktop tab navigation */}
          <nav className="hidden lg:flex items-center gap-0.5" role="tablist" aria-label="Secciones del juego">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  className="text-xs gap-1 h-8"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tab.label}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">{tab.label}</span>
                </Button>
              );
            })}
          </nav>

          {/* Theme toggle */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={toggleTheme}
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>

          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Opciones">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSave}>
                <Download className="w-4 h-4 mr-2" />
                Guardar partida
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Exportar partida
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImport}>
                <Upload className="w-4 h-4 mr-2" />
                Importar partida
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleNewGame} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Nueva partida
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile side menu */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-64 bg-card border-l z-50 transform transition-transform lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Menú de navegación"
      >
        <div className="p-4 pt-14 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                variant={isActive ? 'default' : 'ghost'}
                className="w-full justify-start gap-2"
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                aria-label={`Ir a ${tab.label}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden" role="tabpanel">
        {renderContent()}
      </main>

      {/* Bottom tab bar - mobile & tablet */}
      <nav 
        className="lg:hidden flex items-center border-t bg-card/80 backdrop-blur-sm shrink-0 safe-area-bottom" 
        role="tablist"
        aria-label="Navegación principal"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
              <span className={`text-[10px] mt-0.5 ${isActive ? 'font-medium' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Debug Panel */}
      <DebugPanel />
    </div>
  );
}
