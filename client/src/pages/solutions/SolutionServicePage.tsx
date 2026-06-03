import React, { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { getSectorBySlug, getServiceBySlug } from '../../data/solutions';
import { SolutionPageTemplate } from '../../components/SolutionPageTemplate';

export default function SolutionServicePage() {
  const [match, params] = useParams();
  const sectorSlug = params?.sector;
  const serviceSlug = params?.service;
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Scroll to top when page changes
    window.scrollTo(0, 0);
  }, [sectorSlug, serviceSlug]);

  if (!sectorSlug || !serviceSlug) {
    setLocation('/404');
    return null;
  }

  const sector = getSectorBySlug(sectorSlug);
  const service = getServiceBySlug(sectorSlug, serviceSlug);

  if (!sector || !service) {
    setLocation('/404');
    return null;
  }

  return (
    <main>
      <SolutionPageTemplate sector={sector} service={service} />
    </main>
  );
}
