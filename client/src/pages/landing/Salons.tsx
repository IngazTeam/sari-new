import React from 'react';
import { SectorHubTemplate } from '../../components/SectorHubTemplate';
import { salonsData } from '../../data/solutions/salons';

export default function Salons() {
  return <SectorHubTemplate sector={salonsData} />;
}