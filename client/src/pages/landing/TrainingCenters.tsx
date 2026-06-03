import React from 'react';
import { SectorHubTemplate } from '../../components/SectorHubTemplate';
import { trainingCentersData } from '../../data/solutions/training-centers';

export default function TrainingCenters() {
  return <SectorHubTemplate sector={trainingCentersData} />;
}