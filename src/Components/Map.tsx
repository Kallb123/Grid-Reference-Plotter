import { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import OsGridRef from '../gridref-to-latlng';

import { Position, projectBearingDistance } from "aviation-math";
import RectangleLayer from './RectangleLayer';

interface Props {
  gridRef: string,
  scale: number,
  width: number,
  height: number,
};

const Map = (props: Props) => {
    const {
      gridRef,
      scale,
      width,
      height
    } = props;

    let parsedOS = OsGridRef.parse(gridRef);
    let convertedLatLng = OsGridRef.osGridToLatLong(parsedOS);

    const position : LatLngTuple = [convertedLatLng.lat, convertedLatLng.lon]

    const widthMeters = scale * width / 100;
    const heightMeters = scale * height / 100;
    const diagonalDistance = Math.sqrt(widthMeters*widthMeters + heightMeters*heightMeters);
    const diagonalDistanceNM = diagonalDistance / 1852;
    // const topLeft = projectBearingDistance(new Position(position[0], position[1]), 315, diagonalDistanceNM/2);
    const topRight = projectBearingDistance(new Position(position[0], position[1]), 45, diagonalDistanceNM/2);
    // const bottomRight = projectBearingDistance(new Position(position[0], position[1]), 135, diagonalDistanceNM/2);
    const bottomLeft = projectBearingDistance(new Position(position[0], position[1]), 225, diagonalDistanceNM/2);
    
    const rectangle : LatLngBoundsExpression = [
      [bottomLeft.lat, bottomLeft.lon],
      [topRight.lat, topRight.lon],
    ]

    return (
      <MapContainer center={position} zoom={13} scrollWheelZoom={false} style={{height: "500px"}}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            A pretty CSS3 popup. <br /> Easily customizable. <span>{ gridRef }</span>
          </Popup>
        </Marker>
        <RectangleLayer rectangle={rectangle} />
      </MapContainer>
    )

}

export default Map;
