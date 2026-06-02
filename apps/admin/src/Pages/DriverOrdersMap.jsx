import {
    GoogleMap,
    Marker,
    LoadScript
  } from '@react-google-maps/api';
  import { CheckIcon } from '@chakra-ui/icons';
  
  const OrderMap = ({ orders }) => {
    const center = {
      lat: orders[0]?.latitude || 37.7749,
      lng: orders[0]?.longitude || -122.4194,
    };
  
    const containerStyle = {
      width: '100%',
      height: '500px',
    };
  
    return (
      <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={12}
        >
          {orders.map((order, index) => {
            const iconColor =
              order.isAttended
                ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                : order.orderStatus?.toLowerCase().includes('pickup')
                ? 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png'
                : 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';
  
            return (
              <Marker
                key={order.orderId}
                position={{ lat: order.latitude, lng: order.longitude }}
                label={{
                  text: String(index + 1),
                  color: 'white',
                  fontWeight: 'bold'
                }}
                icon={{
                  url: iconColor,
                }}
                title={`${index + 1}. ${order.customerName} - ${order.orderStatus}`}
              />
            );
          })}
        </GoogleMap>
      </LoadScript>
    );
  };
  
  export default OrderMap;
  