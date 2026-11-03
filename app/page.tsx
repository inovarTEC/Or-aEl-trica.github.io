'use client';
import dynamic from 'next/dynamic';

const OrcaApp = dynamic(() => import('./components/orca-app'), { ssr: false });

export default function Page() {
  return <OrcaApp />;
}
