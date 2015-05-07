function SubLayerFactory() {};

SubLayerFactory.createSublayer = function(type, layer, position) {
  type = type && type.toLowerCase();
  if (!type || type === 'mapnik' || type === 'cartodb') {
    return new CartoDBSubLayer(layer, position);
  } else if (type === 'http') {
    return new HttpSubLayer(layer, position);
  } else {
    throw 'Sublayer type not supported';
  }
};

function SubLayerBase(_parent, position) {
  this._parent = _parent;
  this._position = position;
  this._added = true;
}

SubLayerBase.prototype = {

  toJSON: function() {
    throw 'toJSON must be implemented';
  },

  remove: function() {
    this._check();
    this._parent.removeLayer(this._position);
    this._added = false;
    this.trigger('remove', this);
    this._onRemove();
  },

  _onRemove: function() {},

  toggle: function() {
    this.get('hidden') ? this.show() : this.hide();
    return !this.get('hidden');
  },

  show: function() {
    if(this.get('hidden')) {
      this.set({
        hidden: false
      });
    }
  },

  hide: function() {
    if(!this.get('hidden')) {
      this.set({
        hidden: true
      });
    }
  },

  set: function(new_attrs) {
    this._check();
    var def = this._parent.getLayer(this._position);
    var attrs = def.options;
    for(var i in new_attrs) {
      attrs[i] = new_attrs[i];
    }
    this._parent.setLayer(this._position, def);
    if (new_attrs.hidden !== undefined) {
      this.trigger('change:visibility', this, new_attrs.hidden);
    }
    return this;
  },

  unset: function(attr) {
    var def = this._parent.getLayer(this._position);
    delete def.options[attr];
    this._parent.setLayer(this._position, def);
  },

  get: function(attr) {
    this._check();
    var attrs = this._parent.getLayer(this._position);
    return attrs.options[attr];
  },

  _check: function() {
    if(!this._added) throw "sublayer was removed";
  },

  _unbindInteraction: function() {
    if(!this._parent.off) return;
    this._parent.off(null, null, this);
  },

  _bindInteraction: function() {
    if(!this._parent.on) return;
    var self = this;
    // binds a signal to a layer event and trigger on this sublayer
    // in case the position matches
    var _bindSignal = function(signal, signalAlias) {
      signalAlias = signalAlias || signal;
      self._parent.on(signal, function() {
        var args = Array.prototype.slice.call(arguments);
        if (parseInt(args[args.length - 1], 10) ==  self._position) {
          self.trigger.apply(self, [signalAlias].concat(args));
        }
      }, self);
    };
    _bindSignal('featureOver');
    _bindSignal('featureOut');
    _bindSignal('featureClick');
    _bindSignal('layermouseover', 'mouseover');
    _bindSignal('layermouseout', 'mouseout');
  },

  _setPosition: function(p) {
    this._position = p;
  }
};

// give events capabilitues
_.extend(SubLayerBase.prototype, Backbone.Events);


// CartoDB / Mapnik sublayers
function CartoDBSubLayer(layer, position) {
  SubLayerBase.call(this, layer, position);
  this._bindInteraction();

  // TODO: Test this
  if (Backbone.Model && this._parent.getLayer(this._position)) {
    this.infowindow = new Backbone.Model(this._parent.getLayer(this._position).infowindow);
    this.infowindow.bind('change', function() {
      var def = this._parent.getLayer(this._position);
      def.infowindow = this.infowindow.toJSON();
      this._parent.setLayer(this._position, def);
    }, this);
  }
};

CartoDBSubLayer.prototype = _.extend({}, SubLayerBase.prototype, {

  toJSON: function() {
    var json = {
      type: 'cartodb',
      options: {
        sql: this.getSQL(),
        cartocss: this.getCartoCSS(),
        cartocss_version: this.get('cartocss_version') || '2.1.0',
        interactivity: this.getInteractivity()
      }
    };

    if (this.get('attributes')) {
      json.options.attributes = this.getAttributes();
    }
    if (this.get('raster')) {
      json.options.geom_column = "the_raster_webmercator";
      json.options.geom_type = "raster";
      // raster needs 2.3.0 to work
      json.options.cartocss_version = this.get('cartocss_version') || '2.3.0';
    }
    return json;
  },

  _onRemove: function() {
    this._unbindInteraction();
  },

  setSQL: function(sql) {
    return this.set({
      sql: sql
    });
  },

  setCartoCSS: function(cartocss) {
    return this.set({
      cartocss: cartocss
    });
  },

  setInteractivity: function(fields) {
    return this.set({
      interactivity: fields
    });
  },

  setInteraction: function(active) {
    this._parent.setInteraction(this._position, active);
  },

  getSQL: function() {
    return this.get('sql');
  },

  getCartoCSS: function() {
    return this.get('cartocss');
  },

  getInteractivity: function() {
    var interactivity = this.get('interactivity');
    if (typeof(interactivity) === 'string') {
      interactivity = interactivity.split(',');
    }
    return this._trimArrayItems(interactivity);
  },

  getAttributes: function() {
    var columns = [];
    if (this.get('attributes')) {
      columns = this.get('attributes');
    } else {
      var infowindow = this.getInfowindowData();
      if (infowindow) {
        columns = _.map(infowindow.fields, function(field){
          return field.name;
        });
      }
    }
    return {
      id: 'cartodb_id',
      columns: this._trimArrayItems(columns)
    }
  },

  _trimArrayItems: function(array) {
    return _.map(array, function(item) {
      return item.trim();
    })
  },

  getInfowindowData: function() {
    var infowindow = this.infowindow;
    if (!infowindow) {
      var layer = this.options.layer_definition && this.options.layer_definition.layers[this._position];
      infowindow = layer.infowindow;
    }
    if (infowindow && infowindow.fields && infowindow.fields.length > 0) {
      return infowindow;
    }
    return null;
  }
});

// Http sublayer

function HttpSubLayer(layer, position) {
  SubLayerBase.call(this, layer, position);
};

HttpSubLayer.prototype = _.extend({}, SubLayerBase.prototype, {

  setURLTemplate: function(urlTemplate) {
    return this.set({
      urlTemplate: urlTemplate
    });
  },

  setSubdomains: function(subdomains) {
    return this.set({
      subdomains: subdomains
    });
  },

  setTms: function(tms) {
    return this.set({
      tms: tms
    });
  },

  getURLTemplate: function(urlTemplate) {
    return this.get('urlTemplate');
  },

  getSubdomains: function(subdomains) {
    return this.get('subdomains');
  },

  getTms: function(tms) {
    return this.get('tms');
  }
});

