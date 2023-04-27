import React from 'react';
import { useState } from 'react';
import './App.css';
import Map from './Components/Map';
import {parse} from 'csv-parse/browser/esm/sync';
import { LatLngBoundsLiteral, LatLngTuple } from 'leaflet';
import { Position, projectBearingDistance } from 'aviation-math';
import OsGridRef from './gridref-to-latlng';

function App() {
  const [rectangles, setRectangles] = useState([] as LatLngBoundsLiteral[]);

  const processNewFile = (file: File) => {
    // setting up the reader
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');

    // here we tell the reader what to do when it's done reading...
    reader.onload = readerEvent => {
      if (!readerEvent.target) return;
      const content = readerEvent.target.result; // this is the content!
      if (!content) return;
      if (typeof content !== "string") return;
      const data : string[][] = parse(content, {
        skip_empty_lines: true,
        delimiter: ','
      });
      console.log(data);

      const parsedData = data.map(row => {
        let parsedOS = OsGridRef.parse(row[0]);
        let convertedLatLng = OsGridRef.osGridToLatLong(parsedOS);
      
        const position : LatLngTuple = [convertedLatLng.lat, convertedLatLng.lon]
      
        const widthMeters = parseInt(row[1]) * parseInt(row[2]) / 100;
        const heightMeters = parseInt(row[1]) * parseInt(row[3]) / 100;
        const diagonalDistance = Math.sqrt(widthMeters*widthMeters + heightMeters*heightMeters);
        const diagonalDistanceNM = diagonalDistance / 1852;
        // const topLeft = projectBearingDistance(new Position(position[0], position[1]), 315, diagonalDistanceNM/2);
        const topRight = projectBearingDistance(new Position(position[0], position[1]), 45, diagonalDistanceNM/2);
        // const bottomRight = projectBearingDistance(new Position(position[0], position[1]), 135, diagonalDistanceNM/2);
        const bottomLeft = projectBearingDistance(new Position(position[0], position[1]), 225, diagonalDistanceNM/2);

        const bounds : LatLngBoundsLiteral = [
          [bottomLeft.lat, bottomLeft.lon],
          [topRight.lat, topRight.lon],
        ]

        return bounds;
      });

      setRectangles(parsedData);
    }
  }

  return (
    <div className="App">
      <Map rectangles={rectangles}></Map>
      <input type='file'
        onChange={e => {if (!e.currentTarget.files) return; return processNewFile(e.currentTarget.files[0])}}
        onClick={e => (e.currentTarget.value = '')}  />
    </div>
  );
}

export default App;
