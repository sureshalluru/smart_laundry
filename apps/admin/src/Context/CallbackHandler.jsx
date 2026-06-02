// src/Components/CallbackHandler.js
import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';

export default function CallbackHandler() {
    const auth = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const handleAuth = async () => {
            try {
                if (auth.isLoading) return;
                if (auth.isAuthenticated) {
                    const returnTo = auth.user?.state?.returnTo ||
                        (auth.user?.profile?.['custom:laundryId'] ? `/${auth.user.profile['custom:laundryId']}/admin` : '/');
                    sessionStorage.removeItem('returnTo');
                    navigate(returnTo);
                } else if (auth.error) {
                    console.error('Authentication error:', auth.error);
                    navigate('/');
                }
            } catch (error) {
                console.error('Error handling authentication:', error);
                navigate('/');
            }
        };

        const handleCallback = async () => {
            try {
                await auth.signinRedirectCallback();
            } catch (error) {
                console.error('Error handling callback:', error);
                navigate('/');
            }
        };

        if (window.location.pathname === '/callback') {
            handleCallback();
        } else {
            handleAuth();
        }

        const timer = setInterval(handleAuth, 100);
        return () => clearInterval(timer);
    }, [auth, navigate]);

    return <LoadingSpinner />;
}