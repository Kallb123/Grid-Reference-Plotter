import React from 'react';
import { useState } from 'react';
import './App.css';
import Map from './Components/Map';

function App() {
  const [gridRef, setGridRef] = useState('NU 12765 42058');
  const [scale, setScale] = useState(1000);
  const [width, setWidth] = useState(23.0);
  const [height, setHeight] = useState(23.0);
  const [gridRefSet, setGridRefSet] = useState('NU 12765 42058');
  const [scaleSet, setScaleSet] = useState(1000);
  const [widthSet, setWidthSet] = useState(23.0);
  const [heightSet, setHeightSet] = useState(23.0);

  const updateVariables = () => {
    console.log("Updating variables");
    setGridRefSet(gridRef);
    setScaleSet(scale);
    setWidthSet(width);
    setHeightSet(height);
  }

  return (
    <div className="App">
      <Map gridRef={gridRefSet} scale={scaleSet} width={widthSet} height={heightSet}></Map>
      <label>Reference - <input type='text' value={gridRef} onInput={e => setGridRef(e.currentTarget.value)} /></label><br />
      <label>Scale - 1:<input type='number' value={scale} onInput={e => setScale(parseInt(e.currentTarget.value))} /></label><br />
      <label>Width - <input type='number' value={width} onInput={e => setWidth(parseFloat(e.currentTarget.value))} /></label><br />
      <label>Height - <input type='number' value={height} onInput={e => setHeight(parseFloat(e.currentTarget.value))} /></label><br />
      <button onClick={updateVariables}>Submit</button>
    </div>
  );
}

export default App;
