import { LatLngTuple } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import OsGridRef from '../gridref-to-latlng';

interface Props {
    test: string
};

const Map = (props: Props) => {
    const {
        test
    } = props;

    let parsedOS = OsGridRef.parse("NU 12765 42058");
    let convertedLatLng = OsGridRef.osGridToLatLong(parsedOS);

    const position : LatLngTuple = [convertedLatLng.lat, convertedLatLng.lon]

    return (
      <MapContainer center={position} zoom={13} scrollWheelZoom={false} style={{height: "500px"}}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            A pretty CSS3 popup. <br /> Easily customizable. <span>{ test }</span>
          </Popup>
        </Marker>
      </MapContainer>
    )

}

export default Map;
