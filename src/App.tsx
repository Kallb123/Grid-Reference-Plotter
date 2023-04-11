import React from 'react';
import { useState } from 'react';
import './App.css';
import Map from './Components/Map';

function App() {
  const [gridRef, setGridRef] = useState('NU 12765 42058');
  const [scale, setScale] = useState(1000);
  const [gridRefSet, setGridRefSet] = useState('NU 12765 42058');
  const [scaleSet, setScaleSet] = useState(1000);

  const updateVariables = () => {
    console.log("Updating variables");
    setGridRefSet(gridRef);
    setScaleSet(scale);
  }

  return (
    <div className="App">
      <Map gridRef={gridRefSet} scale={scaleSet}></Map>
      <label>Reference - <input type='text' value={gridRef} onInput={e => setGridRef(e.currentTarget.value)} /></label><br />
      <label>Scale - 1:<input type='number' value={scale} onInput={e => setScale(parseInt(e.currentTarget.value))} /></label><br />
      <button onClick={updateVariables}>Submit</button>
    </div>
  );
}

export default App;
