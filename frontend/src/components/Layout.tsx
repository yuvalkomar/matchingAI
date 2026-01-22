import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, GitMerge, Home } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/import', label: 'Import', icon: FileText },
    { path: '/matching', label: 'Matching', icon: GitMerge },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      {location.pathname !== '/' && (
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <img 
                    src="/small_logo.png" 
                    alt="MatchingAI Logo" 
                    className="h-8 w-auto mr-2"
                  />
                  <h1 className="text-xl font-bold text-primary-blue">MatchingAI</h1>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  {navItems.slice(1).map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                          isActive(item.path)
                            ? 'border-primary-gold text-primary-blue'
                            : 'border-transparent text-text-secondary hover:text-primary-blue hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </nav>
      )}
      
      {/* Main content */}
      <main>{children}</main>
    </div>
  );
};

export default Layout;
