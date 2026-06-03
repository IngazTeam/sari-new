import React from 'react';
import { SectorHubTemplate } from '../../components/SectorHubTemplate';
import { consultantsData } from '../../data/solutions/consultants';

export default function Consultants() {
  return <SectorHubTemplate sector={consultantsData} />;
}