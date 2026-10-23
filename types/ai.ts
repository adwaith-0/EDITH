import { RentalDraft } from './rental';

export type AILanguage = 'en' | 'hi' | 'ml';
export type AIResultMode = 'AI' | 'DEMO_FALLBACK';
export interface AIStatus {
  configured: boolean;
  provider: string;
  model: string;
  visionConfigured: boolean;
  visionModel?: string;
}
export type AIListingFields = Pick<RentalDraft, 'name' | 'address' | 'connectorType' | 'currentType' | 'powerKw' | 'hourlyRatePaise' | 'parking' | 'accessInstructions' | 'terms'>;
export interface AIListingDraftRequest {
  notes: string;
  labelImage?: { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };
  useDemoFallback?: boolean;
}
export interface AIListingDraftResult {
  mode: AIResultMode;
  model: string;
  draft: Partial<AIListingFields>;
  missingFields: string[];
  warnings: string[];
  notice: string;
}
export interface AIGuideRequest {
  question: string;
  language: AILanguage;
  listingIds?: string[];
  useDemoFallback?: boolean;
}
export interface AISource { id: string; title: string; kind: 'POLICY' | 'LISTING' }
export interface AIGuideResult {
  mode: AIResultMode;
  model: string;
  answer: string;
  sources: AISource[];
  caveats: string[];
}
export interface AIHostMetrics {
  ownedListings: number;
  publishedListings: number;
  bookingCount: number;
  pendingRequests: number;
  completedSessions: number;
  cancelledBookings: number;
  demoBookingValuePaise: number;
}
export interface AIHostInsightsResult {
  mode: AIResultMode;
  model: string;
  summary: string;
  metrics: AIHostMetrics;
  suggestions: { title: string; detail: string }[];
  notice: string;
}
