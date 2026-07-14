// User Types
export interface User {
  id: string;
  email?: string;
  phone?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerifiedVillager: boolean;
  reputationScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Profile extends User {
  bio?: string;
  location?: string;
  totalTransactions: number;
  totalVolumeSats: number;
}

export interface Wallet {
  id: string;
  userId: string;
  balanceSats: number;
  pendingBalanceSats: number;
  escrowBalanceSats: number;
  totalEarnedSats: number;
  totalSpentSats: number;
}

// Transaction Types
export type TransactionType = 'payment' | 'withdrawal' | 'deposit' | 'escrow' | 'commission';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type RelatedType = 'marketplace_order' | 'service_contract' | 'bounty' | 'donation' | 'p2p';

export interface Transaction {
  id: string;
  userId: string;
  transactionType: TransactionType;
  relatedType?: RelatedType;
  relatedId?: string;
  amountSats: number;
  commissionSats: number;
  netAmountSats: number;
  status: TransactionStatus;
  lightningInvoice?: string;
  lightningPaymentHash?: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
}

// Marketplace Types
export interface MarketplaceListing {
  id: string;
  sellerId: string;
  title: string;
  description?: string;
  category?: string;
  priceSats: number;
  currency: string;
  priceUsd?: number;
  images?: string[];
  condition?: 'new' | 'used' | 'refurbished';
  shippingMethod?: 'standard' | 'express' | 'local_pickup';
  shippingCostSats: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  isActive: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface MarketplaceOrder {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  transactionId: string;
  escrowId: string;
  quantity: number;
  totalPriceSats: number;
  shippingAddress?: Record<string, any>;
  shippingMethod?: string;
  status: OrderStatus;
  autoReleaseDays: number;
  createdAt: Date;
  updatedAt: Date;
}

// Service Types
export interface ServiceListing {
  id: string;
  providerId: string;
  title: string;
  description?: string;
  category?: string;
  basePriceSats: number;
  priceType: 'fixed' | 'hourly' | 'milestone';
  deliveryTimeDays?: number;
  revisionLimit: number;
  images?: string[];
  isActive: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceContractStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'disputed';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected';

export interface ServiceContract {
  id: string;
  listingId: string;
  buyerId: string;
  providerId: string;
  totalPriceSats: number;
  status: ServiceContractStatus;
  autoCompleteDays: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface ServiceMilestone {
  id: string;
  contractId: string;
  milestoneNumber: number;
  title?: string;
  description?: string;
  amountSats: number;
  transactionId?: string;
  escrowId?: string;
  status: MilestoneStatus;
  dueDate?: Date;
  completedAt?: Date;
  approvedAt?: Date;
}

// Bounty Types
export type BountyStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type BountyCategory = 'bug' | 'lost_item' | 'research' | 'challenge';

export interface Bounty {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  category?: BountyCategory;
  rewardSats: number;
  transactionId?: string;
  escrowId?: string;
  status: BountyStatus;
  maxSolvers: number;
  deadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type BountySubmissionStatus = 'pending' | 'accepted' | 'rejected';

export interface BountySubmission {
  id: string;
  bountyId: string;
  solverId: string;
  submissionText?: string;
  submissionFiles?: string[];
  status: BountySubmissionStatus;
  submittedAt: Date;
  reviewedAt?: Date;
}

// Crowdfunding Types
export type CampaignStatus = 'active' | 'completed' | 'cancelled' | 'ended';

export interface Campaign {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  category?: string;
  goalSats: number;
  currentSats: number;
  goalUsd?: number;
  currentUsd?: number;
  images?: string[];
  videoUrl?: string;
  deadline?: Date;
  status: CampaignStatus;
  isFeatured: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Donation {
  id: string;
  campaignId: string;
  donorId: string;
  transactionId: string;
  amountSats: number;
  amountUsd?: number;
  isAnonymous: boolean;
  message?: string;
  createdAt: Date;
}

// Verification Types
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type PaymentStatus = 'pending' | 'completed' | 'failed';

export interface Verification {
  id: string;
  userId: string;
  verriffSessionId?: string;
  status: VerificationStatus;
  strikePaymentAddress?: string;
  paymentAmountUsd: number;
  paymentAmountSats?: number;
  lightningInvoice?: string;
  lightningPaymentHash?: string;
  paymentStatus?: PaymentStatus;
  verificationData?: Record<string, any>;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Dispute Types
export type DisputeType = 'marketplace_order' | 'service_contract' | 'bounty';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';
export type ResolutionType = 'refund' | 'release' | 'split' | 'dismissed';

export interface Dispute {
  id: string;
  disputeType: DisputeType;
  relatedId: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  status: DisputeStatus;
  resolutionType?: ResolutionType;
  resolutionAmountSats?: number;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Review Types
export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  relatedType: RelatedType;
  relatedId: string;
  rating: number; // 1-5
  title?: string;
  comment?: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Orukka Ring Types
export type RingType = 'payment_ring' | 'business_ring';
export type OrukkaOrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface OrukkaOrder {
  id: string;
  userId: string;
  ringType: RingType;
  transactionId?: string;
  amountUsd: number;
  amountSats: number;
  lightningInvoice?: string;
  lightningPaymentHash?: string;
  status: OrukkaOrderStatus;
  shippingAddress: Record<string, any>;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
