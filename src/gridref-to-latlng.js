/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Ordnance Survey Grid Reference functions  (c) Chris Veness 2005-2014                          */
/*   - www.movable-type.co.uk/scripts/gridref.js                                                  */
/*   - www.movable-type.co.uk/scripts/latlon-gridref.html                                         */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
'use strict';

/**
 * Creates a OsGridRef object
 *
 * @constructor
 * @classdesc Convert OS grid references to/from OSGB latitude/longitude points
 * @requires LatLonE, GeoParams (from latlon-ellipse.js)
 *
 * @param {Number} easting - Easting in metres from OS false origin
 * @param {Number} northing - Northing in metres from OS false origin
 */
function OsGridRef(easting, northing) {
    this.easting = Math.floor(Number(easting));
    this.northing = Math.floor(Number(northing));
}

export default OsGridRef;


/**
 * Convert (OSGB36) latitude/longitude to Ordnance Survey grid reference easting/northing coordinate
 *
 * @param   {LatLonE} point - OSGB36 latitude/longitude
 * @returns {OsGridRef} OS Grid Reference easting/northing
 * @throws  Error if datum of point is not OSGB36
 */
OsGridRef.latLongToOsGrid = function(point) {
    if (point.datum != GeoParams.datum.OSGB36) throw new Error('Can only convert OSGB36 point to OsGrid');
    var φ = point.lat.toRadians();
    var λ = point.lon.toRadians();

    var a = 6377563.396, b = 6356256.909;      // Airy 1830 major & minor semi-axes
    var F0 = 0.9996012717;                     // NatGrid scale factor on central meridian
    var φ0 = (49).toRadians(), λ0 = (-2).toRadians();  // NatGrid true origin is 49°N,2°W
    var N0 = -100000, E0 = 400000;             // northing & easting of true origin, metres
    var e2 = 1 - (b*b)/(a*a);                  // eccentricity squared
    var n = (a-b)/(a+b), n2 = n*n, n3 = n*n*n; // n, n², n³

    var cosφ = Math.cos(φ), sinφ = Math.sin(φ);
    var ν = a*F0/Math.sqrt(1-e2*sinφ*sinφ);            // nu = transverse radius of curvature
    var ρ = a*F0*(1-e2)/Math.pow(1-e2*sinφ*sinφ, 1.5); // rho = meridional radius of curvature
    var η2 = ν/ρ-1;                                    // eta = ?

    var Ma = (1 + n + (5/4)*n2 + (5/4)*n3) * (φ-φ0);
    var Mb = (3*n + 3*n*n + (21/8)*n3) * Math.sin(φ-φ0) * Math.cos(φ+φ0);
    var Mc = ((15/8)*n2 + (15/8)*n3) * Math.sin(2*(φ-φ0)) * Math.cos(2*(φ+φ0));
    var Md = (35/24)*n3 * Math.sin(3*(φ-φ0)) * Math.cos(3*(φ+φ0));
    var M = b * F0 * (Ma - Mb + Mc - Md);              // meridional arc

    var cos3φ = cosφ*cosφ*cosφ;
    var cos5φ = cos3φ*cosφ*cosφ;
    var tan2φ = Math.tan(φ)*Math.tan(φ);
    var tan4φ = tan2φ*tan2φ;

    var I = M + N0;
    var II = (ν/2)*sinφ*cosφ;
    var III = (ν/24)*sinφ*cos3φ*(5-tan2φ+9*η2);
    var IIIA = (ν/720)*sinφ*cos5φ*(61-58*tan2φ+tan4φ);
    var IV = ν*cosφ;
    var V = (ν/6)*cos3φ*(ν/ρ-tan2φ);
    var VI = (ν/120) * cos5φ * (5 - 18*tan2φ + tan4φ + 14*η2 - 58*tan2φ*η2);

    var Δλ = λ-λ0;
    var Δλ2 = Δλ*Δλ, Δλ3 = Δλ2*Δλ, Δλ4 = Δλ3*Δλ, Δλ5 = Δλ4*Δλ, Δλ6 = Δλ5*Δλ;

    var N = I + II*Δλ2 + III*Δλ4 + IIIA*Δλ6;
    var E = E0 + IV*Δλ + V*Δλ3 + VI*Δλ5;

    return new OsGridRef(E, N);
}


/**
 * Convert Ordnance Survey grid reference easting/northing coordinate to (OSGB36) latitude/longitude
 *
 * @param   {OsGridRef} gridref - easting/northing to be converted to latitude/longitude
 * @returns {LatLonE} latitude/longitude (in OSGB36) of supplied grid reference
 */
OsGridRef.osGridToLatLong = function(gridref) {
    var E = gridref.easting;
    var N = gridref.northing;

    var a = 6377563.396, b = 6356256.909;         // Airy 1830 major & minor semi-axes
    var F0 = 0.9996012717;                        // NatGrid scale factor on central meridian
    var φ0 = 49*Math.PI/180, λ0 = -2*Math.PI/180; // NatGrid true origin
    var N0 = -100000, E0 = 400000;                // northing & easting of true origin, metres
    var e2 = 1 - (b*b)/(a*a);                     // eccentricity squared
    var n = (a-b)/(a+b), n2 = n*n, n3 = n*n*n;    // n, n², n³

    var φ=φ0, M=0;
    do {
        φ = (N-N0-M)/(a*F0) + φ;

        var Ma = (1 + n + (5/4)*n2 + (5/4)*n3) * (φ-φ0);
        var Mb = (3*n + 3*n*n + (21/8)*n3) * Math.sin(φ-φ0) * Math.cos(φ+φ0);
        var Mc = ((15/8)*n2 + (15/8)*n3) * Math.sin(2*(φ-φ0)) * Math.cos(2*(φ+φ0));
        var Md = (35/24)*n3 * Math.sin(3*(φ-φ0)) * Math.cos(3*(φ+φ0));
        M = b * F0 * (Ma - Mb + Mc - Md);              // meridional arc

    } while (N-N0-M >= 0.00001);  // ie until < 0.01mm

    var cosφ = Math.cos(φ), sinφ = Math.sin(φ);
    var ν = a*F0/Math.sqrt(1-e2*sinφ*sinφ);            // nu = transverse radius of curvature
    var ρ = a*F0*(1-e2)/Math.pow(1-e2*sinφ*sinφ, 1.5); // rho = meridional radius of curvature
    var η2 = ν/ρ-1;                                    // eta = ?

    var tanφ = Math.tan(φ);
    var tan2φ = tanφ*tanφ, tan4φ = tan2φ*tan2φ, tan6φ = tan4φ*tan2φ;
    var secφ = 1/cosφ;
    var ν3 = ν*ν*ν, ν5 = ν3*ν*ν, ν7 = ν5*ν*ν;
    var VII = tanφ/(2*ρ*ν);
    var VIII = tanφ/(24*ρ*ν3)*(5+3*tan2φ+η2-9*tan2φ*η2);
    var IX = tanφ/(720*ρ*ν5)*(61+90*tan2φ+45*tan4φ);
    var X = secφ/ν;
    var XI = secφ/(6*ν3)*(ν/ρ+2*tan2φ);
    var XII = secφ/(120*ν5)*(5+28*tan2φ+24*tan4φ);
    var XIIA = secφ/(5040*ν7)*(61+662*tan2φ+1320*tan4φ+720*tan6φ);

    var dE = (E-E0), dE2 = dE*dE, dE3 = dE2*dE, dE4 = dE2*dE2, dE5 = dE3*dE2, dE6 = dE4*dE2, dE7 = dE5*dE2;
    φ = φ - VII*dE2 + VIII*dE4 - IX*dE6;
    var λ = λ0 + X*dE - XI*dE3 + XII*dE5 - XIIA*dE7;

    return new LatLonE(φ.toDegrees(), λ.toDegrees(), GeoParams.datum.OSGB36);
}


/**
 * Converts standard grid reference (eg 'SU387148') to fully numeric ref (eg [438700,114800])
 *
 * @param   {String} gridref - standard format OS grid reference
 * @returns {OsGridRef} numeric version of grid reference in metres from false origin, centred on
 *          supplied grid square
 */
OsGridRef.parse = function(gridref) {
    gridref = gridref.trim();
    // get numeric values of letter references, mapping A->0, B->1, C->2, etc:
    var l1 = gridref.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
    var l2 = gridref.toUpperCase().charCodeAt(1) - 'A'.charCodeAt(0);
    // shuffle down letters after 'I' since 'I' is not used in grid:
    if (l1 > 7) l1--;
    if (l2 > 7) l2--;

    // convert grid letters into 100km-square indexes from false origin (grid square SV):
    var e = ((l1-2)%5)*5 + (l2%5);
    var n = (19-Math.floor(l1/5)*5) - Math.floor(l2/5);
    if (e<0 || e>6 || n<0 || n>12) return new OsGridRef(NaN, NaN);

    // skip grid letters to get numeric part of ref, stripping any spaces:
    gridref = gridref.slice(2).replace(/ /g,'');

    // append numeric part of references to grid index:
    e += gridref.slice(0, gridref.length/2);
    n += gridref.slice(gridref.length/2);

    // normalise to 1m grid, rounding up to centre of grid square:
    switch (gridref.length) {
        case 0: e += '50000'; n += '50000'; break;
        case 2: e += '5000'; n += '5000'; break;
        case 4: e += '500'; n += '500'; break;
        case 6: e += '50'; n += '50'; break;
        case 8: e += '5'; n += '5'; break;
        case 10: break; // 10-digit refs are already 1m
        default: return new OsGridRef(NaN, NaN);
    }

    return new OsGridRef(e, n);
}


/**
 * Converts ‘this’ numeric grid reference to standard OS grid reference
 *
 * @param   {Number} [digits=6] Precision of returned grid reference (6 digits = metres)
 * @returns {String} this grid reference in standard format
 */
OsGridRef.prototype.toString = function(digits) {
    digits = (typeof digits == 'undefined') ? 10 : digits;
    var e = this.easting;
    var n = this.northing;
    if (e==NaN || n==NaN) return '??';

    // get the 100km-grid indices
    var e100k = Math.floor(e/100000), n100k = Math.floor(n/100000);

    if (e100k<0 || e100k>6 || n100k<0 || n100k>12) return '';

    // translate those into numeric equivalents of the grid letters
    var l1 = (19-n100k) - (19-n100k)%5 + Math.floor((e100k+10)/5);
    var l2 = (19-n100k)*5%25 + e100k%5;

    // compensate for skipped 'I' and build grid letter-pairs
    if (l1 > 7) l1++;
    if (l2 > 7) l2++;
    var letPair = String.fromCharCode(l1+'A'.charCodeAt(0), l2+'A'.charCodeAt(0));

    // strip 100km-grid indices from easting & northing, and reduce precision
    e = Math.floor((e%100000)/Math.pow(10,5-digits/2));
    n = Math.floor((n%100000)/Math.pow(10,5-digits/2));

    var gridRef = letPair + ' ' + e.padLz(digits/2) + ' ' + n.padLz(digits/2);

    return gridRef;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/** Trims whitespace from string (q.v. blog.stevenlevithan.com/archives/faster-trim-javascript) */
if (typeof String.prototype.trim == 'undefined') {
    String.prototype.trim = function() {
        return this.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    }
}

/** Pads a number with sufficient leading zeros to make it w chars wide */
if (typeof String.prototype.padLz == 'undefined') {
    Number.prototype.padLz = function(w) {
        var n = this.toString();
        var l = n.length;
        for (var i=0; i<w-l; i++) n = '0' + n;
        return n;
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Geodesy tools for an ellipsoidal earth model                       (c) Chris Veness 2005-2014  */
/*                                                                                                */
/* Includes methods for converting lat/lon coordinates bewteen different coordinate systems.      */
/*   - www.movable-type.co.uk/scripts/latlong-convert-coords.html                                 */
/*                                                                                                */
/*  Usage: to eg convert WGS84 coordinate to OSGB coordinate:                                     */
/*   - var wgs84 = new LatLonE(latWGS84, lonWGS84, GeoParams.datum.WGS84);                        */
/*   - var osgb = wgs84.convertDatum(GeoParams.datum.OSGB36);                                     */
/*   - var latOSGB = osgb.lat, lonOSGB = osgb.lon;                                                */
/*                                                                                                */
/*  q.v. Ordnance Survey 'A guide to coordinate systems in Great Britain' Section 6               */
/*   - www.ordnancesurvey.co.uk/docs/support/guide-coordinate-systems-great-britain.pdf           */
/*                                                                                                */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Ellipsoid parameters and datum parameters for transforming lat/lon coordinates between different
 * coordinate systems.
 *
 * @namespace
 */
var GeoParams = {};


/**
 * Ellipsoid parameters; major axis (a), minor axis (b), and flattening (f) for each ellipsoid.
 */
GeoParams.ellipsoid = {
    WGS84:        { a: 6378137,     b: 6356752.3142,   f: 1/298.257223563 },
    GRS80:        { a: 6378137,     b: 6356752.314140, f: 1/298.257222101 },
    Airy1830:     { a: 6377563.396, b: 6356256.909,    f: 1/299.3249646   },
    AiryModified: { a: 6377340.189, b: 6356034.448,    f: 1/299.32496     },
    Intl1924:     { a: 6378388.000, b: 6356911.946,    f: 1/297.0         },
    Bessel1841:   { a: 6377397.155, b: 6356078.963,    f: 1/299.152815351 }
};

/**
 * Datums; with associated *ellipsoid* and Helmert *transform* parameters to convert from WGS84
 * into given datum.
 */
GeoParams.datum = {
    WGS84: {
        ellipsoid: GeoParams.ellipsoid.WGS84,
        transform: { tx:    0.0,    ty:    0.0,     tz:    0.0,    // m
                     rx:    0.0,    ry:    0.0,     rz:    0.0,    // sec
                      s:    0.0 }                                  // ppm
    },
    OSGB36: { // www.ordnancesurvey.co.uk/docs/support/guide-coordinate-systems-great-britain.pdf
        ellipsoid: GeoParams.ellipsoid.Airy1830,
        transform: { tx: -446.448,  ty:  125.157,   tz: -542.060,  // m
                     rx:   -0.1502, ry:   -0.2470,  rz:   -0.8421, // sec
                      s:   20.4894 }                               // ppm
    },
    ED50: { // og.decc.gov.uk/en/olgs/cms/pons_and_cop/pons/pon4/pon4.aspx
        ellipsoid: GeoParams.ellipsoid.Intl1924,
        transform: { tx:   89.5,    ty:   93.8,     tz:  123.1,    // m
                     rx:    0.0,    ry:    0.0,     rz:    0.156,  // sec
                      s:   -1.2 }                                  // ppm
    },
    Irl1975: { // maps.osni.gov.uk/CMS_UserFiles/file/The_irish_grid.pdf
        ellipsoid: GeoParams.ellipsoid.AiryModified,
        transform: { tx: -482.530,  ty:  130.596,   tz: -564.557,  // m
                     rx:   -1.042,  ry:   -0.214,   rz:   -0.631,  // sec
                      s:   -8.150 }                                // ppm
    },
    TokyoJapan: { // www.geocachingtoolbox.com?page=datumEllipsoidDetails
        ellipsoid: GeoParams.ellipsoid.Bessel1841,
        transform: { tx:  148,      ty: -507,       tz: -685,      // m
                     rx:    0,      ry:    0,       rz:    0,      // sec
                      s:    0 }                                    // ppm
    }
};


/**
 * Creates lat/lon (polar) point with latitude & longitude values and height above ellipsoid, on a
 * specified datum.
 *
 * @classdesc Library of geodesy functions for operations on an ellipsoidal earth model.
 * @requires GeoParams
 * @requires Vector3d
 *
 * @constructor
 * @param {number}          lat - Geodetic latitude in degrees.
 * @param {number}          lon - Longitude in degrees.
 * @param {GeoParams.datum} [datum=WGS84] - Datum this point is defined within.
 * @param {number}          [height=0] - Height above ellipsoid, in metres.
 */
function LatLonE(lat, lon, datum, height) {
    if (typeof datum == 'undefined') datum = GeoParams.datum.WGS84;
    if (typeof height == 'undefined') height = 0;

    this.lat = Number(lat);
    this.lon = Number(lon);
    this.datum = datum;
    this.height = Number(height);
}


/**
 * Converts ‘this’ lat/lon coordinate to new coordinate system.
 *
 * @param   {GeoParams.datum} toDatum - Datum this coordinate is to be converted to.
 * @returns {LatLonE} This point converted to new datum.
 */
LatLonE.prototype.convertDatum = function(toDatum) {
    var oldLatLon = this;

    if (oldLatLon.datum == GeoParams.datum.WGS84) {
        // converting from WGS84
        var transform = toDatum.transform;
    }
    if (toDatum == GeoParams.datum.WGS84) {
        // converting to WGS84; use inverse transform (don't overwrite original!)
        var transform = {};
        for (var param in oldLatLon.datum.transform) {
            transform[param] = -oldLatLon.datum.transform[param];
        }
    }
    if (typeof transform == 'undefined') {
        // neither this.datum nor toDatum are WGS84: convert this to WGS84 first
        oldLatLon = this.convertDatum(GeoParams.datum.WGS84);
        var transform = toDatum.transform;
    }

    // convert polar to cartesian
    var cartesian = oldLatLon.toCartesian();

    // apply transform
    cartesian = cartesian.applyTransform(transform);

    // convert cartesian to polar
    var newLatLon = cartesian.toLatLon(toDatum);

    return newLatLon;
}


/**
 * Converts ‘this’ point from polar (lat/lon) coordinates to cartesian (x/y/z) coordinates.
 *
 * @returns {Vector3d} Vector pointing to lat/lon point, with x, y, z in metres from earth centre.
 */
LatLonE.prototype.toCartesian = function() {
    var φ = this.lat.toRadians(), λ = this.lon.toRadians(), H = this.height;
    var a = this.datum.ellipsoid.a, b = this.datum.ellipsoid.b;

    var sinφ = Math.sin(φ), cosφ = Math.cos(φ);
    var sinλ = Math.sin(λ), cosλ = Math.cos(λ);

    var eSq = (a*a - b*b) / (a*a);
    var ν = a / Math.sqrt(1 - eSq*sinφ*sinφ);

    var x = (ν+H) * cosφ * cosλ;
    var y = (ν+H) * cosφ * sinλ;
    var z = ((1-eSq)*ν + H) * sinφ;

    var point = new Vector3d(x, y, z);

    return point;
}


/**
 * Converts ‘this’ point from cartesian (x/y/z) coordinates to polar (lat/lon) coordinates on
 * specified datum.
 *
 * @augments Vector3d
 * @param {GeoParams.datum.transform} datum - Datum to use when converting point.
 */
Vector3d.prototype.toLatLon = function(datum) {
    var x = this.x, y = this.y, z = this.z;

    var a = datum.ellipsoid.a, b = datum.ellipsoid.b;

    var eSq = (a*a - b*b) / (a*a);
    var p = Math.sqrt(x*x + y*y);
    var φ = Math.atan2(z, p*(1-eSq)), φʹ; // initial value of φ

    var precision = 1 / a;  // 1m: Helmert transform cannot generally do better than a few metres
    do {
        var sinφ = Math.sin(φ);
        var ν = a / Math.sqrt(1 - eSq*sinφ*sinφ);
        φʹ = φ;
        φ = Math.atan2(z + eSq*ν*sinφ, p);
    } while (Math.abs(φ-φʹ) > precision);

    var λ = Math.atan2(y, x);
    var H = p/Math.cos(φ) - ν;

    var point = new LatLonE(φ.toDegrees(), λ.toDegrees(), datum, H);

    return point;
}

/**
 * Applies Helmert transform to ‘this’ point using transform parameters t.
 *
 * @private
 * @augments Vector3d
 * @param {GeoParams.datum.transform} t - Transform to apply to this point.
 */
Vector3d.prototype.applyTransform = function(t)   {
    var x1 = this.x, y1 = this.y, z1 = this.z;

    var tx = t.tx, ty = t.ty, tz = t.tz;
    var rx = (t.rx/3600).toRadians(); // normalise seconds to radians
    var ry = (t.ry/3600).toRadians(); // normalise seconds to radians
    var rz = (t.rz/3600).toRadians(); // normalise seconds to radians
    var s1 = t.s/1e6 + 1;             // normalise ppm to (s+1)

    // apply transform
    var x2 = tx + x1*s1 - y1*rz + z1*ry;
    var y2 = ty + x1*rz + y1*s1 - z1*rx;
    var z2 = tz - x1*ry + y1*rx + z1*s1;

    var point = new Vector3d(x2, y2, z2);

    return point;
}


/**
 * Returns a string representation of ‘this’ point, formatted as degrees, degrees+minutes, or
 * degrees+minutes+seconds.
 *
 * @param   {string} [format=dms] - Format point as 'd', 'dm', 'dms'.
 * @param   {number} [dp=0|2|4] - Number of decimal places to use - default 0 for dms, 2 for dm, 4 for d.
 * @returns {string} Comma-separated latitude/longitude.
 */
// LatLonE.prototype.toString = function(format, dp) {
//     return Geo.toLat(this.lat, format, dp) + ', ' + Geo.toLon(this.lon, format, dp);
// }


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/** Extend Number object with method to convert numeric degrees to radians */
if (typeof Number.prototype.toRadians == 'undefined') {
    Number.prototype.toRadians = function() { return this * Math.PI / 180; }
}

/** Extend Number object with method to convert radians to numeric (signed) degrees */
if (typeof Number.prototype.toDegrees == 'undefined') {
    Number.prototype.toDegrees = function() { return this * 180 / Math.PI; }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Vector handling functions                                         (c) Chris Veness 2011-2014  */
/*                                                                                                */
/*  These are generic 3-d vector manipulation routines.                                           */
/*                                                                                                */
/*  In a geodesy context, these may be used to represent:                                         */
/*   - n-vector representing a normal to point on Earth's surface                                 */
/*   - earth-centered, earth fixed vector (= n-vector for spherical model)                        */
/*   - great circle normal to vector                                                              */
/*   - motion vector on Earth's surface                                                           */
/*   - etc                                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Creates a 3-d vector.
 *
 * The vector may be normalised, or use x/y/z values for eg height relative to the sphere or
 * ellipsoid, distance from earth centre, etc.
 *
 * @classdesc Tools for manipulating 3-d vectors, to support various latitude/longitude functions.
 *
 * @constructor
 * @param {number} x - X component of vector.
 * @param {number} y - Y component of vector.
 * @param {number} z - Z component of vector.
 */
function Vector3d(x, y, z) {
    this.x = Number(x);
    this.y = Number(y);
    this.z = Number(z);
}


/**
 * Adds supplied vector to ‘this’ vector.
 *
 * @param   {Vector3d} v - Vector to be added to this vector.
 * @returns {Vector3d} Vector representing sum of this and v.
 */
Vector3d.prototype.plus = function(v) {
    return new Vector3d(this.x + v.x, this.y + v.y, this.z + v.z);
}


/**
 * Subtracts supplied vector from ‘this’ vector.
 *
 * @param   {Vector3d} v - Vector to be subtracted from this vector.
 * @returns {Vector3d} Vector representing difference between this and v.
 */
Vector3d.prototype.minus = function(v) {
    return new Vector3d(this.x - v.x, this.y - v.y, this.z - v.z);
}


/**
 * Multiplies ‘this’ vector by a scalar value.
 *
 * @param   {number}   x - Factor to multiply this vector by.
 * @returns {Vector3d} Vector scaled by x.
 */
Vector3d.prototype.times = function(x) {
    x = Number(x);
    //console.log(this.toString(), x, (new Vector3d(this.x * x, this.y * x, this.z * x)).toString());
    return new Vector3d(this.x * x, this.y * x, this.z * x);
}


/**
 * Divides ‘this’ vector by a scalar value.
 *
 * @param   {number}   x - Factor to divide this vector by.
 * @returns {Vector3d} Vector divided by x.
 */
Vector3d.prototype.dividedBy = function(x) {
    x = Number(x);
    return new Vector3d(this.x / x, this.y / x, this.z / x);
}


/**
 * Multiplies ‘this’ vector by the supplied vector using dot (scalar) product.
 *
 * @param   {Vector3d} v - Vector to be dotted with this vector.
 * @returns {number} Dot product of ‘this’ and v.
 */
Vector3d.prototype.dot = function(v) {
    return this.x*v.x + this.y*v.y + this.z*v.z;
}


/**
 * Multiplies ‘this’ vector by the supplied vector using cross (vector) product.
 *
 * @param   {Vector3d} v - Vector to be crossed with this vector.
 * @returns {Vector3d} Cross product of ‘this’ and v.
 */
Vector3d.prototype.cross = function(v) {
    var x = this.y*v.z - this.z*v.y;
    var y = this.z*v.x - this.x*v.z;
    var z = this.x*v.y - this.y*v.x;

    return new Vector3d(x, y, z);
}


/**
 * Negates a vector to point in the opposite direction
 *
 * @returns {Vector3d} Negated vector.
 */
Vector3d.prototype.negate = function() {
    return new Vector3d(-this.x, -this.y, -this.z);
}


/**
 * Length (magnitude or norm) of ‘this’ vector
 *
 * @returns {number} Magnitude of this vector.
 */
Vector3d.prototype.length = function() {
    return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
}


/**
 * Normalizes a vector to its unit vector
 * – if the vector is already unit or is zero magnitude, this is a no-op.
 *
 * @returns {Vector3d} Normalised version of this vector.
 */
Vector3d.prototype.unit = function() {
    var norm = this.length();
    if (norm == 1) return this;
    if (norm == 0) return this;

    var x = this.x/norm;
    var y = this.y/norm;
    var z = this.z/norm;

    return new Vector3d(x, y, z);
}


/**
 * Calculates the angle between ‘this’ vector and supplied vector.
 *
 * @param   {Vector3d} v
 * @returns {number} Angle (in signed radians) between this vector and supplied vector.
 */
Vector3d.prototype.angleTo = function(v) {
    var sinθ = this.cross(v).length();
    var cosθ = this.dot(v);

    return Math.atan2(sinθ, cosθ);
}


/**
 * Rotates ‘this’ point around an axis by a specified angle.
 *
 * @param   {Vector3d} axis - The axis being rotated around.
 * @param   {number}   theta - The angle of rotation (in radians).
 * @returns {Vector3d} The rotated point.
 */
Vector3d.prototype.rotateAround = function(axis, theta) {
    // en.wikipedia.org/wiki/Rotation_matrix#Rotation_matrix_from_axis_and_angle
    // en.wikipedia.org/wiki/Quaternions_and_spatial_rotation#Quaternion-derived_rotation_matrix
    var p1 = this.unit();
    var p = [ p1.x, p1.y, p1.z ]; // the point being rotated
    var a = axis.unit();          // the axis being rotated around
    var s = Math.sin(theta);
    var c = Math.cos(theta);
    // quaternion-derived rotation matrix
    var q = [ [ a.x*a.x*(1-c) + c,     a.x*a.y*(1-c) - a.z*s, a.x*a.z*(1-c) + a.y*s],
        [ a.y*a.x*(1-c) + a.z*s, a.y*a.y*(1-c) + c,     a.y*a.z*(1-c) - a.x*s],
        [ a.z*a.x*(1-c) - a.y*s, a.z*a.y*(1-c) + a.x*s, a.z*a.z*(1-c) + c    ] ];
    // multiply q × p
    var qp = [0, 0, 0];
    for (var i=0; i<3; i++) {
        for (var j=0; j<3; j++) {
            qp[i] += q[i][j] * p[j];
        }
    }
    var p2 = new Vector3d(qp[0], qp[1], qp[2]);
    return p2;
    // qv en.wikipedia.org/wiki/Rodrigues'_rotation_formula...
}


/**
 * String representation of vector.
 *
 * @param   {number} [precision=3] - Number of decimal places to be used.
 * @returns {string} Vector represented as [x,y,z].
 */
Vector3d.prototype.toString = function(precision) {
    if (typeof precision == 'undefined') precision = 3;

    var p = Number(precision);

    var str = '[' + this.x.toFixed(p) + ',' + this.y.toFixed(p) + ',' + this.z.toFixed(p) + ']';

    return str;
}
