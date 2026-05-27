'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full border-destructive/50">
            <CardHeader className="text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-2" />
              <CardTitle className="text-destructive">
                Algo salió mal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Un error inesperado ha ocurrido en la Taberna del Viejo Greg. 
                No te preocupes, tu partida debería estar guardada.
              </p>
              {this.state.error && (
                <details className="text-left text-xs text-muted-foreground bg-muted p-2 rounded">
                  <summary className="cursor-pointer font-medium">Detalles del error</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{this.state.error.message}</pre>
                </details>
              )}
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={this.handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reintentar
                </Button>
                <Button variant="default" onClick={this.handleReload}>
                  Recargar página
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
