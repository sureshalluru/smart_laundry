import React, { createContext, useContext } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

const libraries = ['places'];

const GoogleMapsContext = createContext({ isLoaded: false });

export const useGoogleMaps = () => useContext(GoogleMapsContext);

export const GoogleMapsProvider = ({ children }) => {
    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
        libraries,
    });

    return (
        <GoogleMapsContext.Provider value={{ isLoaded }}>
            {children}
        </GoogleMapsContext.Provider>
    );
};
