import React from 'react';
import { SectorHubTemplate } from '../../components/SectorHubTemplate';
import { clinicsData } from '../../data/solutions/clinics';

export default function Clinics() {
  return <SectorHubTemplate sector={clinicsData} />;
}