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
var IO            = require('pex-sys').IO;

function loadJSON(file, cb) {
  return new Promise(function(resolve, reject) {
    IO.loadTextFile(file, function(data) {
      resolve(JSON.parse(data));
    });
  });
}

function loadTSV(file, types) {
  return new Promise(function(resolve, reject) {
    IO.loadTextFile(file, function(data) {
      var lines = data.trim().split('\n');
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
      resolve(results);
    });
  })
}

var DPI = 2;
var WorldRadius = 0.75;
var DegToRad = 1/180.0 * Math.PI;

var layers = {
  axis: false,
  latLng: true,
  countries: true,
  states: true,
  cities: true
}

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
    fullscreen: Platform.isBrowser ? true : false,
    borderless: false
  },
  init: function() {
    var worldMeshInside = new Mesh(new Sphere(WorldRadius-0.01, 36, 18), new SolidColor({ color: Color.Black }), { triangles: true });

    this.debugCube = new Mesh(new Cube(0.01), new SolidColor({ color: Color.Red }));
    this.debugCube.position = evalPos(WorldRadius, 24, 54);

    this.camera = new Camera(60, this.width / this.height, 0.1, 10);
    this.arcball = new Arcball(this, this.camera);

    this.scene = [ worldMeshInside ];

    if (layers.axis) {
      var axisHelper = new AxisHelper();
      this.scene.push(axisHelper);
    }

    if (layers.latLng) {
      var worldMesh = new Mesh(new Sphere(WorldRadius, 36, 18), new SolidColor({ color: Color.DarkGrey }), { lines: true });
      this.scene.push(worldMesh);
    }

    if (layers.countries) this.loadCountries();
    if (layers.states) this.loadStates();
    if (layers.cities) this.loadCities();
  },
  loadCountries: function() {
    Promise.all([
      loadJSON('data/world-50m.json'),
      loadTSV('data/world-country-names.tsv')
    ])
    .then(function(data) {
      this.buildCountries(data[0], data[1]);
    }.bind(this))
  },
  buildCountries: function(world, countryNames) {
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

    var countriesMesh = new Mesh(countriesLineBuilder, new SolidColor({ color: Color.Yellow }), { lines: true });
    this.scene.push(countriesMesh);
    console.log('Countries mesh vertices', countriesLineBuilder.vertices.length);
  },
  loadStates: function() {
    loadJSON('data/states-provinces.json').then(this.buildStates.bind(this));
  },
  buildStates: function(statesData) {
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

    var statesMesh = new Mesh(statesLineBuilder, new SolidColor({ color: Color.Cyan }), { lines: true });
    this.scene.push(statesMesh);
    console.log('States mesh vertices', statesLineBuilder.vertices.length);
  },
  loadCities: function() {
    loadJSON('data/cities.json').then(this.buildCities.bind(this));
  },
  buildCities: function(citiesJSON) {
    var cities = topojson.feature(citiesJSON, citiesJSON.objects.cities).features;
    var cityPoints = cities.map(function(city) {
      var lng = city.geometry.coordinates[0];
      var lat = city.geometry.coordinates[1];
      return evalPos(WorldRadius, lat, lng);
    })
    var citiesMesh = new Mesh(new Geometry({ vertices: cityPoints }), new SolidColor({ color: Color.White, pointSize: 5 }), { points: true });
    this.scene.push(citiesMesh);
  },
  draw: function() {
    this.gl.depthFunc(this.gl.LEQUAL);
    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);

    this.scene.forEach(function(m) {
      m.draw(this.camera);
    }.bind(this));
  }
});
