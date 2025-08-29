import { useState } from 'react'
import { 
  Menu, X, LayoutGrid, Router, Printer, Box, Moon, Sun, CheckSquare, Settings, Home
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useTheme } from '../contexts/theme'
import { HeaderDropdowns } from './PopUp'
import { useNavigationStore, Page } from '../store/navigation'

// Types
interface NavigationItem {
  name: string
  href: Page
  icon: React.ComponentType<any>
}

interface NavLinkProps {
  item: NavigationItem
  mobile?: boolean
  onClick?: () => void
}

// Constants
const NAVIGATION_ITEMS: NavigationItem[] = [
  { name: 'Início', href: 'dashboard', icon: Home },
  { name: 'Dispositivos', href: 'devices', icon: LayoutGrid },
  { name: 'Roteadores', href: 'routers', icon: Router },
  { name: 'Impressoras', href: 'printers', icon: Printer },
  { name: 'Caixas', href: 'boxes', icon: Box },
  { name: 'Tarefas', href: 'tasks', icon: CheckSquare },
  { name: 'Configurações', href: 'settings', icon: Settings },
]

// Components
const Logo = () => (
  <div className="flex items-center">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
      <LayoutGrid className="h-5 w-5 text-white" />
    </div>
    <h1 className="ml-3 text-xl lg:text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 truncate">
      Super IPS
    </h1>
  </div>
)

const NavLink: React.FC<NavLinkProps> = ({ item, mobile = false, onClick }) => {
  const currentPage = useNavigationStore((state) => state.currentPage)
  const setPage = useNavigationStore((state) => state.setPage)
  const Icon = item.icon
  const isActive = currentPage === item.href

  const handleClick = () => {
    setPage(item.href)
    onClick?.()
  }

  return (
    <button
      onClick={handleClick}
      className={`group w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-2xl transition-all duration-300 transform
        ${
          isActive
            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
            : 'text-gray-600 dark:text-gray-300 hover:bg-white/5 dark:hover:bg-white/3 hover:text-indigo-600 dark:hover:text-indigo-300'
        }
      `}
    >
      <Icon className={`h-5 w-5 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
      <span className="truncate">{item.name}</span>
      {isActive && <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />}
    </button>
  )
}

const MobileMenuButton = ({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="lg:hidden text-gray-600 dark:text-gray-300 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition flex-shrink-0"
  >
    {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
  </button>
)

const ThemeToggle = ({ isDarkMode, onToggle }: { isDarkMode: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition flex-shrink-0"
  >
    {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
  </button>
)

const DesktopSidebar = () => (
  <aside className="hidden lg:flex fixed left-4 top-28 bottom-4 w-72 z-30">
    <div className="w-full rounded-3xl p-4 backdrop-blur-md bg-white/80 dark:bg-gray-800/70 shadow-2xl ring-1 ring-white/30 dark:ring-black/20 overflow-hidden">
      <nav className="space-y-2 h-full overflow-y-auto">
        {NAVIGATION_ITEMS.map((item) => (
          <NavLink key={item.name} item={item} />
        ))}
      </nav>
    </div>
  </aside>
)

const MobileSidebar = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-4 right-4 top-32 max-w-sm mx-auto rounded-3xl p-4 bg-white/95 dark:bg-gray-800/95 shadow-2xl">
        <nav className="space-y-2 max-h-96 overflow-y-auto">
          {NAVIGATION_ITEMS.map((item) => (
            <NavLink key={item.name} item={item} mobile onClick={onClose} />
          ))}
        </nav>
      </div>
    </div>
  )
}

const Header = (props: {
  isMobileMenuOpen: boolean
  onMobileMenuToggle: () => void
  isDarkMode: boolean
  onThemeToggle: () => void
  onLogout: () => void
}) => {
  const { isMobileMenuOpen, onMobileMenuToggle, isDarkMode, onThemeToggle, onLogout } = props

  return (
    <header className="fixed top-4 left-4 right-4 z-40 h-20">
      <div className="h-full rounded-3xl backdrop-blur-md bg-gradient-to-r from-white/70 to-white/40 dark:from-gray-800/70 dark:to-gray-800/50 shadow-xl ring-1 ring-white/30 dark:ring-black/20 flex items-center px-4 lg:px-6">
        <div className="flex items-center gap-2 lg:gap-4 min-w-0 flex-1">
          <MobileMenuButton isOpen={isMobileMenuOpen} onClick={onMobileMenuToggle} />
          <div className="hidden lg:block">
            <Logo />
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-3">
          <ThemeToggle isDarkMode={isDarkMode} onToggle={onThemeToggle} />
          <HeaderDropdowns logout={onLogout} />
        </div>
      </div>
    </header>
  )
}

const MainContent = ({ children }: { children?: React.ReactNode }) => (
  <main className="pt-24 px-4 lg:px-6 min-h-screen lg:ml-80">
    <div className="p-4 lg:p-6 h-full overflow-auto">
      {children}
    </div>
  </main>
)

// Main Layout Component
export default function Layout({ children }: { children?: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { isDarkMode, toggleDarkMode } = useTheme()
  const { logout } = useAuthStore()

  const handleMobileMenuToggle = () => setIsMobileMenuOpen(!isMobileMenuOpen)
  const handleMobileMenuClose = () => setIsMobileMenuOpen(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      <Header
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={handleMobileMenuToggle}
        isDarkMode={isDarkMode}
        onThemeToggle={toggleDarkMode}
        onLogout={logout}
      />

      <DesktopSidebar />
      <MobileSidebar isOpen={isMobileMenuOpen} onClose={handleMobileMenuClose} />
      <MainContent>{children}</MainContent>
    </div>
  )
}
