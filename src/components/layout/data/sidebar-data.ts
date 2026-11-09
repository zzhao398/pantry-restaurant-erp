import {
  LayoutDashboard,
  FileText,
  Truck,
  Package,
  ShoppingBasket,
  BookOpen,
  Store,
  BarChart3,
  Settings,
  Leaf,
  HelpCircle,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: { name: 'Alex Morgan', email: 'manager@example.com', avatar: '' },
  teams: [{ name: 'Example Kitchen', logo: Leaf, plan: 'Restaurant demo' }],
  navGroups: [
    {
      title: 'Restaurant workspace',
      items: [
        { title: 'Overview', url: '/', icon: LayoutDashboard },
        { title: 'Invoices', url: '/restaurant/invoices', icon: FileText },
        { title: 'Receiving', url: '/restaurant/receiving', icon: Truck },
        { title: 'Inventory', url: '/restaurant/inventory', icon: Package },
        {
          title: 'Daily sales',
          url: '/restaurant/sales',
          icon: ShoppingBasket,
        },
        { title: 'Menu & recipes', url: '/restaurant/recipes', icon: BookOpen },
        { title: 'Suppliers', url: '/restaurant/suppliers', icon: Store },
        { title: 'Reports', url: '/restaurant/reports', icon: BarChart3 },
      ],
    },
    {
      title: 'Workspace',
      items: [
        { title: 'Demo guide', url: '/restaurant/guide', icon: HelpCircle },
        { title: 'Appearance', url: '/settings/appearance', icon: Settings },
      ],
    },
  ],
}
