define(["require", "exports", "esri/map", "esri/SpatialReference", "esri/geometry/Point", "esri/geometry/Polygon", "esri/request", "esri/layers/GraphicsLayer", "esri/graphic", "esri/Color", "esri/symbols/Font", "esri/symbols/SimpleMarkerSymbol", "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleFillSymbol", "esri/symbols/TextSymbol", "esri/tasks/GeometryService", "esri/tasks/locator", "esri/tasks/ProjectParameters", "dojo/Deferred", "dojo/promise/all"], function(require, exports, Map, SpatialReference, Point, Polygon, esriRequest, GraphicsLayer, Graphic, Color, Font, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, TextSymbol, GeometryService, Locator, ProjectParameters, Deferred, promiseAll) {
    var MapController = (function () {
        function MapController(mapDiv) {
            this.mapDiv = mapDiv;
        }
		
        MapController.prototype.start = function () {
            this.initialize();
            var mapLoaded = this.setupMap();
            var cityLoaded = this.loadCityGeometry();

            return promiseAll([mapLoaded, cityLoaded]);
        };

        MapController.prototype.initialize = function () {
            this.geometryService = new GeometryService("http://mapsdev.hamiltontn.gov/arcgis/rest/services/Utilities/Geometry/GeometryServer");
            this.hamiltonGeocoder = new Locator("http://mapsdev.hamiltontn.gov/arcgis/rest/services/Locator_Addressing/GeocodeServer");
            this.worldGeocoder = new Locator("http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer");
            this.wgs84 = new SpatialReference(4326);
        };

        MapController.prototype.setupMap = function () {
            var deferred = new Deferred();

            var chattanoogaLocation = new Point(-85.2672, 35.0456, this.wgs84);
            this.map = new Map(this.mapDiv, { basemap: "osm", center: chattanoogaLocation, zoom: 13 });
            this.map.on("load", function (e) {
                return deferred.resolve(true);
            });

            this.cityLayer = new GraphicsLayer({ opacity: .3 });
            this.map.addLayer(this.cityLayer);

            this.messageLayer = new GraphicsLayer({ opacity: .7 });
            this.map.addLayer(this.messageLayer);

            return deferred.promise;
        };

        MapController.prototype.loadCityGeometry = function () {
            var _this = this;
            this.cityLayer.clear();

            return esriRequest({ url: "geo/chattanooga.geojson", callback: "jsoncallback" }).then(function (response) {
                var feature = response.features[0];

                _this.cityPolygon = new Polygon(feature.geometry.coordinates);
                _this.cityPolygon.setSpatialReference(_this.wgs84);

                var citySymbol = _this.getCitySymbol();
                _this.cityLayer.add(new Graphic(_this.cityPolygon, citySymbol));

                return true;
            });
        };

        MapController.prototype.getCitySymbol = function () {
            var color = Color.fromString("blue");
            var outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, color, 2);
            var citySymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, outline, color);
            return citySymbol;
        };

        MapController.prototype.checkAddress = function (address) {
            var _this = this;
            address = address.trim();

            this.showCheckingMessage();

            this.geocodeAddress(this.hamiltonGeocoder, { "Single Line Input": address }).then(null, function (error) {
                return _this.geocodeAddress(_this.worldGeocoder, { "SingleLine": address });
            }).then(function (candidate) {
                if (candidate.location.spatialReference.wkid == _this.wgs84.wkid)
                    return candidate.location;

                return _this.projectPoint(_this.geometryService, candidate.location, _this.wgs84);
            }).then(function (location) {
                var isWithin = _this.cityPolygon.contains(location);
                _this.showWithinMessage(isWithin, location);

                _this.map.centerAndZoom(location, 20);
            });
        };

        MapController.prototype.geocodeAddress = function (locator, address) {
            var deferred = new Deferred();
            locator.addressToLocations({ address: address }, deferred.resolve, deferred.reject);
            return deferred.promise.then(function (candidates) {
                if (!candidates.length)
                    throw new Error("Could not find address.");
                return candidates[0];
            });
        };

        MapController.prototype.projectPoint = function (geometryService, point, outSpatialReference) {
            var deferred = new Deferred();
            var parameters = new ProjectParameters();
            parameters.geometries = [point];
            parameters.outSR = outSpatialReference;
            geometryService.project(parameters, deferred.resolve, deferred.reject);
            return deferred.promise.then(function (locations) {
                return locations[0];
            });
        };

        MapController.prototype.showCheckingMessage = function () {
            this.messageLayer.clear();

            var mapCenter = this.map.extent.getCenter();

            var text = "Checking...";
            this.addTextGraphic(mapCenter, text);
        };

        MapController.prototype.showWithinMessage = function (isWithin, location) {
            this.messageLayer.clear();

            var text = isWithin ? "Within" : "Not Within";
            this.addTextGraphic(location, text);

            var color = isWithin ? Color.fromString("green") : Color.fromString("red");
            this.addAddressGraphic(location, color);
        };

        MapController.prototype.addTextGraphic = function (point, text) {
            var font = new Font("24pt", Font.STYLE_NORMAL, Font.VARIANT_NORMAL, Font.WEIGHT_BOLD, "sans-serif");
            var textSymbol = new TextSymbol(text, font, Color.fromString("black"));
            textSymbol.horizontalAlignment = TextSymbol.ALIGN_MIDDLE;
            textSymbol.setOffset(0, 13);
            var textGraphic = new Graphic(point, textSymbol);
            this.messageLayer.add(textGraphic);
        };

        MapController.prototype.addAddressGraphic = function (point, color) {
            var outline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, color, 2);
            var addressSymbol = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_DIAMOND, 16, outline, color);
            var addressGraphic = new Graphic(point, addressSymbol);
            this.messageLayer.add(addressGraphic);
        };
        return MapController;
    })();
    return MapController;
});