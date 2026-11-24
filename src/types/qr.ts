export type DeviceType = 'iOS' | 'Android' | 'Desktop';
export type PlanTier = 'starter' | 'business' | 'agency';
export type UserRole = 'admin' | 'client';

export type RouteCategory =
  | 'Restaurant & Cafe'
  | 'Real Estate'
  | 'Product Packaging'
  | 'Local Service'
  | 'Events & Flyers';

export interface UserProfile {
  id: string;
  email: string;
  businessName: string;
  role: UserRole;
  plan: PlanTier;
  createdAt: string;
}

export interface QuotaSummary {
  plan: PlanTier;
  planLabel: string;
  isAdmin: boolean;
  activeRoutes: number;
  maxActiveRoutes: number | null;
  monthlyScans: number;
  maxMonthlyScans: number | null;
}

export interface QrRouteWithStats {
  id: string;
  ownerId: string | null;
  slug: string;
  title: string;
  category: RouteCategory;
  defaultUrl: string;
  iosUrl: string;
  androidUrl: string;
  fallbackUrl: string;
  expiresAt: string | null;
  active: boolean;
  fgColor: string;
  bgColor: string;
  createdAt: string;
  updatedAt: string;
  totalScans: number;
  lastScanAt: string | null;
}

export interface ScanEvent {
  id: string;
  routeId: string;
  slug: string;
  timestamp: string;
  device: DeviceType;
  referrer: string;
  simulated: boolean;
}

export interface AnalyticsResponse {
  totalScans: number;
  totalRoutes: number;
  activeRoutes: number;
  deviceCounts: Record<DeviceType, number>;
  dailySeries: { date: string; label: string; scans: number }[];
  topRoutes: {
    id: string;
    slug: string;
    title: string;
    category: RouteCategory;
    active: boolean;
    scans: number;
  }[];
  recentScans: ScanEvent[];
}

export interface ClientInquiry {
  id: string;
  businessName: string;
  email: string;
  plan: string;
  message: string;
  status: 'New' | 'Contacted';
  createdAt: string;
}

export interface SupabaseIssue {
  code: string;
  message: string;
}
