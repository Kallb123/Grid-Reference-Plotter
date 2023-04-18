import { LatLngBoundsExpression } from "leaflet";
import { useEffect } from "react";
import { Rectangle, useMap } from "react-leaflet";

interface Props {
    rectangle: LatLngBoundsExpression
};
  
const RectangleLayer = (props: Props) => {
    const {
        rectangle
    } = props;

    const mapLink = useMap();

    useEffect(() => {
      mapLink.fitBounds(rectangle);
    }, [mapLink, rectangle])

    const blackOptions = { color: 'black' };

    return (
        <Rectangle bounds={rectangle} pathOptions={blackOptions} />
    )

}

export default RectangleLayer;  