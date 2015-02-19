var fs            = require('fs');
var topojson      = require('topojson');
var R             = require('ramda');

var glu           = require('pex-glu');
var Window        = require('pex-sys').Window;
var Platform      = require('pex-sys').Platform;
var Mesh          = require('pex-glu').Mesh;
var Camera        = require('pex-glu').PerspectiveCamera;
var Arcball       = require('pex-glu').Arcball;
var SolidColor    = require('pex-materials').SolidColor;
var ShowTexCoords = require('pex-materials').ShowTexCoords;
var Color         = require('pex-color').Color;
var Sphere        = require('pex-gen').Sphere;
var Cube          = require('pex-gen').Cube;
var LineBuilder   = require('pex-gen').LineBuilder;
var Vec3          = require('pex-geom').Vec3;
var Geometry      = require('pex-geom').Geometry;
var AxisHelper    = require('pex-helpers').AxisHelper;

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadTSV(file, types) {
  var lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  var columns = lines.shift().split('\t');
  var results = lines.map(function(line) {
    var values = line.split('\t');
    //automatically parse numbers
    values = values.map(function(value) {
      if (isNaN(Number(value))) return value;
      else return Number(value);
    })
    return R.zipObj(columns, values);
  });

  return results;
}

var DPI = 2;
var WorldRadius = 0.75;
var DegToRad = 1/180.0 * Math.PI;

function evalPos(r, lat, lng) {
  var pos = new Vec3();
  pos.x = r * Math.sin((90 - lat) * DegToRad) * Math.sin(lng * DegToRad);
  pos.y = r * Math.cos((90 - lat) * DegToRad);
  pos.z = r * Math.sin((90 - lat) * DegToRad) * Math.cos(lng * DegToRad);
  return pos;
}

Window.create({
  settings: {
    width: 1280 * DPI,
    height: 720 * DPI,
    type: '3d',
    highdpi: DPI,
    fullscreen: Platform.isBrowser ? true : false
  },
  init: function() {
    this.worldMeshInside = new Mesh(new Sphere(WorldRadius-0.01, 36, 18), new SolidColor({ color: Color.Black }), { triangles: true });
    this.worldMesh = new Mesh(new Sphere(WorldRadius, 36, 18), new SolidColor({ color: Color.DarkGrey }), { lines: true });
    this.axisHelper = new AxisHelper();

    this.debugCube = new Mesh(new Cube(0.01), new SolidColor({ color: Color.Red }));
    this.debugCube.position = evalPos(WorldRadius, 24, 54);

    this.camera = new Camera(60, this.width / this.height, 0.1, 2);
    this.arcball = new Arcball(this, this.camera);

    //countries

    var world = loadJSON('data/world-50m.json');
    var countryNames = loadTSV('data/world-country-names.tsv'); // [ { id, name },... ]
    var countries = topojson.feature(world, world.objects.countries).features;

    countries = countries
    .filter(function(country) {
      return country.id != -99; //what is this?
    })
    .map(function(country) {
      var countryName = R.prop('name', R.find(R.where({id: country.id}), countryNames));
      return R.assoc('name', countryName, country)
    });

    var countriesLineBuilder = new LineBuilder();
    countries.forEach(function(country) {
      var polygons = country.geometry.coordinates;
      var type = country.geometry.type;
      if (type == 'MultiPolygon') {
        polygons = R.unnest(polygons);
      }
      polygons.forEach(function(poly) {
        var prevPoint = null;
        for(var i=0; i<=poly.length; i++) {
          var p = poly[i % poly.length]; //[ng, lat]
          var lng = p[0];
          var lat = p[1];
          var point = evalPos(WorldRadius, lat, lng);
          if (prevPoint) {
            countriesLineBuilder.addLine(prevPoint, point);
          }
          prevPoint = point;
        }
      })
    });

    this.countriesMesh = new Mesh(countriesLineBuilder, new SolidColor({ color: Color.Yellow }), { lines: true });
    console.log('Countries mesh vertices', countriesLineBuilder.vertices.length);

    //states

    var statesData = loadJSON('data/states-provinces.json');
    var states = topojson.feature(statesData, statesData.objects['states_provinces.geo']).features;

    var statesLineBuilder = new LineBuilder();
    states.forEach(function(state) {
      var polygons = state.geometry.coordinates;
      var type = state.geometry.type;
      if (type == 'MultiPolygon') {
        polygons = R.unnest(polygons);
      }
      polygons.forEach(function(poly) {
        var prevPoint = null;
        for(var i=0; i<=poly.length; i++) {
          var p = poly[i % poly.length]; //[ng, lat]
          var lng = p[0];
          var lat = p[1];
          var point = evalPos(WorldRadius, lat, lng);
          if (prevPoint) {
            statesLineBuilder.addLine(prevPoint, point);
          }
          prevPoint = point;
        }
      })
    });

    this.statesMesh = new Mesh(statesLineBuilder, new SolidColor({ color: Color.Cyan }), { lines: true });

    console.log('States mesh vertices', statesLineBuilder.vertices.length);

    //cities

    var citiesJSON = loadJSON('data/cities.json');
    var cities = topojson.feature(citiesJSON, citiesJSON.objects.cities).features;
    var cityPoints = cities.map(function(city) {
      var lng = city.geometry.coordinates[0];
      var lat = city.geometry.coordinates[1];
      return evalPos(WorldRadius, lat, lng);
    })
    this.citiesMesh = new Mesh(new Geometry({ vertices: cityPoints }), new SolidColor({ color: Color.White, pointSize: 2 }), { points: true });
  },
  draw: function() {
    this.gl.depthFunc(this.gl.LEQUAL);
    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);
    this.worldMeshInside.draw(this.camera);
    this.worldMesh.draw(this.camera);
    this.statesMesh.draw(this.camera);
    this.countriesMesh.draw(this.camera);
    this.axisHelper.draw(this.camera);
    this.citiesMesh.draw(this.camera);
  }
});
