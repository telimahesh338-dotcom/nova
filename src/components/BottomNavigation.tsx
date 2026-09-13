import React from 'react';
import { Home, FolderCode, FileEdit, Terminal } from 'lucide-react';
import { ActiveTab } from '../types';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const navItems: Array<{
  id: ActiveTab;
  kannadaLabel: string;
  englishLabel: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}> = [
  {
    id: 'home',
    kannadaLabel: 'ಹೋಮ್',
    englishLabel: 'Home',
    icon: Home,
  },
  {
    id: 'files',
    kannadaLabel: 'ಫೈಲ್ಸ್',
    englishLabel: 'Files',
    icon: FolderCode,
  },
  {
    id: 'editing',
    kannadaLabel: 'ಎಡಿಟಿಂಗ್',
    englishLabel: 'Editing',
    icon: FileEdit,
  },
  {
    id: 'terminal',
    kannadaLabel: 'ಟರ್ಮಿನಲ್',
    englishLabel: 'Terminal',
    icon: Terminal,
  },
];

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav
      id="bottom-navigation-bar"
      aria-label="ಮುಖ್ಯ ನ್ಯಾವಿಗೇಶನ್ (Main Navigation)"
      className="fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-xl border-t border-purple-500/20 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.5)] safe-area-pb"
    >
      <div className="max-w-xl mx-auto px-2 py-1.5 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              type="button"
              onClick={() => onTabChange(item.id)}
              aria-selected={isActive}
              role="tab"
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-2 rounded-xl transition-all duration-200 outline-none select-none ${
                isActive
                  ? 'text-white bg-purple-600/20 shadow-inner'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/50'
              }`}
            >
              {isActive && (
                <span className="absolute -top-1.5 w-8 h-1 bg-purple-400 rounded-full shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
              )}
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isActive ? 'scale-110 text-purple-400' : 'scale-100 text-gray-400'
                }`}
              >
                <Icon size={20} />
              </div>
              <span
                className={`text-[12px] leading-tight font-medium tracking-wide ${
                  isActive ? 'text-purple-200 font-semibold' : 'text-gray-400'
                }`}
              >
                {item.kannadaLabel}
              </span>
              <span className="text-[9px] text-gray-400 leading-none">
                {item.englishLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;
