import { AIGuideRequest, AIGuideResult, AIHostInsightsResult, AIListingDraftRequest, AIListingDraftResult, AIStatus } from '@/types/ai';
import { rentalFetch } from './rentalClient';

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const aiClient = {
  status: () => rentalFetch<AIStatus>('/ai/status'),
  listingDraft: (body: AIListingDraftRequest) => rentalFetch<AIListingDraftResult>('/ai/listing-draft', post(body)),
  guide: (body: AIGuideRequest) => rentalFetch<AIGuideResult>('/ai/guide', post(body)),
  hostInsights: (useDemoFallback = false) => rentalFetch<AIHostInsightsResult>('/ai/host-insights', post({ useDemoFallback })),
};
