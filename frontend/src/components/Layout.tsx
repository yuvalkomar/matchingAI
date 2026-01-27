import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, GitMerge } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const navItems = [
    { path: '/import', label: 'Import', icon: FileText },
    { path: '/matching', label: 'Matching', icon: GitMerge },
  ];

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const handleLogoClick = () => {
    // Navigate to home - this will reset all component state
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      {location.pathname !== '/' && (
        <nav className="bg-blue-50/80 backdrop-blur-sm border-b border-blue-200/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <button
                  onClick={handleLogoClick}
                  className="flex-shrink-0 flex items-center cursor-pointer hover:opacity-80 transition-opacity group"
                  title="Return to home screen"
                >
                  <img 
                    src="/small_logo.png" 
                    alt="MatchingAI Logo" 
                    className="h-8 w-auto mr-2"
                  />
                  <h1 className="text-xl font-bold bg-gradient-to-r from-primary-blue to-blue-600 bg-clip-text text-transparent group-hover:from-blue-700 group-hover:to-blue-800 transition-all">
                    MatchingAI
                  </h1>
                </button>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                          isActive(item.path)
                            ? 'border-primary-gold text-primary-blue'
                            : 'border-transparent text-text-secondary opacity-60 hover:text-primary-blue hover:opacity-100'
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
