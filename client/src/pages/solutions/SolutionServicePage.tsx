import React, { useEffect, useMemo } from 'react';
import { useParams, Redirect } from 'wouter';
import { getSectorBySlug, getServiceBySlug } from '../../data/solutions';
import { SolutionPageTemplate } from '../../components/SolutionPageTemplate';

export default function SolutionServicePage() {
  const params = useParams<{ sector: string; service: string }>();
  const sectorSlug = params?.sector;
  const serviceSlug = params?.service;

  useEffect(() => {
    // Scroll to top when page changes
    window.scrollTo(0, 0);
  }, [sectorSlug, serviceSlug]);

  // Resolve sector and service data (memoized to avoid re-computation)
  const { sector, service } = useMemo(() => {
    if (!sectorSlug || !serviceSlug) return { sector: null, service: null };
    return {
      sector: getSectorBySlug(sectorSlug),
      service: getServiceBySlug(sectorSlug, serviceSlug),
    };
  }, [sectorSlug, serviceSlug]);

  // P3 fix: Use <Redirect> instead of setLocation() during render
  if (!sectorSlug || !serviceSlug || !sector || !service) {
    return <Redirect to="/404" />;
  }

  return <SolutionPageTemplate sector={sector} service={service} />;
}
