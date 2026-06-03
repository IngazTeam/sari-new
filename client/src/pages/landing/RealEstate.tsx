import React from 'react';
import { SectorHubTemplate } from '../../components/SectorHubTemplate';
import { realEstateData } from '../../data/solutions/real-estate';

export default function RealEstate() {
  return <SectorHubTemplate sector={realEstateData} />;
}