import { LatLngBoundsLiteral } from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import SingleRectangle from "./SingleRectangle";

interface Props {
    rectangles: LatLngBoundsLiteral[]
};
  
const RectangleLayer = (props: Props) => {
    const {
        rectangles
    } = props;

    const mapLink = useMap();

    useEffect(() => {
        if (!rectangles || rectangles.length === 0) return;
        console.log(rectangles);
        const boundsRectangle : LatLngBoundsLiteral = [
            [   Math.min(...rectangles.map((rect => rect[0][0]))),
                Math.min(...rectangles.map((rect => rect[0][1])))
            ],
            [   Math.max(...rectangles.map((rect => rect[1][0]))),
                Math.max(...rectangles.map((rect => rect[1][1])))
            ],
        ];
        console.log("bounds effect:", boundsRectangle);
        mapLink.fitBounds(boundsRectangle);
        setTimeout(() => {
            console.log("bounds timeout:", boundsRectangle);
            mapLink.fitBounds(boundsRectangle);
        }, 100);
    }, [mapLink, rectangles])

    return (
        <>
        {
            rectangles ? rectangles.map((rectangle, i) => {
                    return <SingleRectangle key={i} rectangle={rectangle} />
                }) : null
        }
        </>
    )

}

export default RectangleLayer;  