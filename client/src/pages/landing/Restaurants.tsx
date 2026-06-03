import React from 'react';
import { SectorHubTemplate } from '../../components/SectorHubTemplate';
import { restaurantsData } from '../../data/solutions/restaurants';

export default function Restaurants() {
  return <SectorHubTemplate sector={restaurantsData} />;
}