export type UserRole = 'passenger' | 'driver' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  rating: number;
  createdAt: string;
}

export interface Driver extends User {
  role: 'driver';
  vehicle: Vehicle;
  documents: DriverDocuments;
  status: 'online' | 'offline' | 'on_ride';
  earnings: Earnings;
  subscription: Subscription;
  isVerified: boolean;
}

export interface Passenger extends User {
  role: 'passenger';
  rides: number;
}

export interface Vehicle {
  model: string;
  plate: string;
  year: number;
  color: string;
  type: 'sedan' | 'hatch' | 'suv' | 'moto';
}

export interface DriverDocuments {
  cnh: DocumentFile;
  rg: DocumentFile;
  vehicleDoc: DocumentFile;
  selfie: DocumentFile;
  status: 'pending' | 'approved' | 'rejected';
}

export interface DocumentFile {
  url: string;
  verified: boolean;
  uploadedAt: string;
}

export interface Subscription {
  status: 'active' | 'expired' | 'suspended';
  amount: number;
  dueDate: string;
  paidAt?: string;
}

export interface Earnings {
  today: number;
  week: number;
  month: number;
  total: number;
}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  name?: string;
}

export type RideStatus =
  | 'searching'
  | 'driver_found'
  | 'driver_on_way'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Ride {
  id: string;
  passenger: Passenger;
  driver?: Driver;
  origin: Location;
  destination: Location;
  status: RideStatus;
  price: number;
  distance: number;
  duration: number;
  rating?: number;
  createdAt: string;
  completedAt?: string;
}
