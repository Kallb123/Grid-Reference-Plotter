import { LatLngBoundsLiteral } from 'leaflet';
import { MapContainer, TileLayer } from 'react-leaflet';
import RectangleLayer from './RectangleLayer';

interface Props {
  rectangles: LatLngBoundsLiteral[]
};

const Map = (props: Props) => {
    const {
      rectangles
    } = props;

    let boundsRectangle : LatLngBoundsLiteral | undefined = undefined;
    if (rectangles && rectangles.length > 0) {
      console.log(rectangles);
      boundsRectangle = [
          [   Math.min(...rectangles.map((rect => rect[0][0]))),
              Math.min(...rectangles.map((rect => rect[0][1])))
          ],
          [   Math.max(...rectangles.map((rect => rect[1][0]))),
              Math.max(...rectangles.map((rect => rect[1][1])))
          ],
      ];
    }

    return (
      <MapContainer bounds={boundsRectangle} scrollWheelZoom={true} style={{height: "500px"}}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RectangleLayer rectangles={rectangles} />
      </MapContainer>
    )

}

export default Map;
