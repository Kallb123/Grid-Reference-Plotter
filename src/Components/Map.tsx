import { LatLngBoundsLiteral, LatLngTuple } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import OsGridRef from '../gridref-to-latlng';

import { Position, projectBearingDistance } from "aviation-math";
import RectangleLayer from './RectangleLayer';

interface Props {
  rectangles: LatLngBoundsLiteral[]
};

const Map = (props: Props) => {
    const {
      rectangles
    } = props;

    let center = undefined;
    if (rectangles && rectangles[0] && rectangles[0][0]) center = rectangles[0][0];

    return (
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{height: "500px"}}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RectangleLayer rectangles={rectangles} />
      </MapContainer>
    )

}

export default Map;
