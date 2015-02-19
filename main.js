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
var Color         = require('pex-color').Color;
var Sphere        = require('pex-gen').Sphere;
var LineBuilder   = require('pex-gen').LineBuilder;
var Vec3          = require('pex-geom').Vec3;
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

var WorldRadius = 0.5;
var DegToRad = 1/180.0 * Math.PI;

function evalPos(r, theta, phi) {
  var pos = new Vec3();
  pos.x = r * Math.sin(theta * DegToRad) * Math.sin(phi * DegToRad);
  pos.y = r * Math.cos(theta * DegToRad);
  pos.z = r * Math.sin(theta * DegToRad) * Math.cos(phi * DegToRad);
  return pos;
}

Window.create({
  settings: {
    width: 1280,
    height: 720,
    type: '3d',
    fullscreen: Platform.isBrowser ? true : false
  },
  init: function() {
    this.worldMeshInside = new Mesh(new Sphere(WorldRadius-0.01, 36, 18), new SolidColor({ color: Color.Black }), { triangles: true });
    this.worldMesh = new Mesh(new Sphere(WorldRadius, 36, 18), new SolidColor({ color: Color.DarkGrey }), { lines: true });
    this.axisHelper = new AxisHelper();

    this.camera = new Camera(60, this.width / this.height);
    this.arcball = new Arcball(this, this.camera);

    var countries = this.loadData();
    var lineBuilder = new LineBuilder();
    countries.forEach(function(country) {
      var polygons = country.geometry.coordinates;
      var type = country.geometry.type;
      if (type == 'MultiPolygon') {
        polygons = R.unnest(polygons);
      }
      polygons.forEach(function(poly) {
        var prevPoint = null;
        for(var i=0; i<=poly.length; i++) {
          var p = poly[i % poly.length];
          var point = evalPos(WorldRadius, p[1] - 90, p[0]);
          if (prevPoint) {
            lineBuilder.addLine(prevPoint, point);
          }
          prevPoint = point;
        }
      })
    });

    this.countriesMesh = new Mesh(lineBuilder, new SolidColor({ color: Color.Yellow }), { lines: true });
    console.log('Countries mesh vertices', lineBuilder.vertices.length);
  },
  loadData: function() {
    var world = loadJSON('data/world-50m.json');
    var countryNames = loadTSV('data/world-country-names.tsv'); // [ { id, name },... ]
    var countries = topojson.feature(world, world.objects.countries).features;

    return countries
    .filter(function(country) {
      return country.id != -99; //what is this?
    })
    .map(function(country) {
      var countryName = R.prop('name', R.find(R.where({id: country.id}), countryNames));
      return R.assoc('name', countryName, country)
    });
  },
  draw: function() {
    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);
    this.worldMeshInside.draw(this.camera);
    this.worldMesh.draw(this.camera);
    this.countriesMesh.draw(this.camera);
    this.axisHelper.draw(this.camera);
  }
});
