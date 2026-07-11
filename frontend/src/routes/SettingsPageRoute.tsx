/**
 * SettingsPageRoute.tsx
 * Settings route wrapper - lazy-loaded.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { SettingsPage } from '../components/settings';

const SettingsPageRoute: React.FC = () => {
  const location = useLocation();
  const fromGame = location.state?.fromGame === true;
  return <SettingsPage fromGame={fromGame} />;
};

export default SettingsPageRoute;
