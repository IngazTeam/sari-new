import { SectorData } from './types';
import { clinicsData } from './clinics';
import { restaurantsData } from './restaurants';
import { salonsData } from './salons';
import { trainingCentersData } from './training-centers';
import { realEstateData } from './real-estate';
import { consultantsData } from './consultants';

export const allSectors: SectorData[] = [
  clinicsData,
  restaurantsData,
  salonsData,
  trainingCentersData,
  realEstateData,
  consultantsData
];

export const getSectorBySlug = (slug: string): SectorData | undefined => {
  return allSectors.find(sector => sector.slug === slug);
};

export const getServiceBySlug = (sectorSlug: string, serviceSlug: string) => {
  const sector = getSectorBySlug(sectorSlug);
  if (!sector) return null;
  return sector.services.find(service => service.slug === serviceSlug) || null;
};

export * from './types';
