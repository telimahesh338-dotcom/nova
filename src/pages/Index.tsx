import React, { useState } from 'react';
import VoiceAssistant from '@/components/VoiceAssistant';
import { FilesView } from '@/components/FilesView';
import { EditingView } from '@/components/EditingView';
import { TerminalView } from '@/components/TerminalView';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ActiveTab } from '@/types';

const Index = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [editingFilePath, setEditingFilePath] = useState<string>('src/App.tsx');

  const handleOpenFileInEditor = (filePath: string) => {
    setEditingFilePath(filePath);
    setActiveTab('editing');
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col relative">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Main Tab Views */}
      <main id="main-content" className="flex-1 w-full relative">
        {/* Home view - kept mounted so voice assistant state and streams are preserved */}
        <div className={activeTab === 'home' ? 'block' : 'hidden'}>
          <VoiceAssistant />
        </div>

        {/* Files view */}
        {activeTab === 'files' && (
          <div className="animate-fade-in">
            <FilesView onOpenFileInEditor={handleOpenFileInEditor} />
          </div>
        )}

        {/* Editing view */}
        {activeTab === 'editing' && (
          <div className="animate-fade-in">
            <EditingView initialFilePath={editingFilePath} />
          </div>
        )}

        {/* Terminal view */}
        {activeTab === 'terminal' && (
          <div className="animate-fade-in">
            <TerminalView />
          </div>
        )}
      </main>

      {/* Persistent Bottom Navigation Bar across all tabs */}
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
