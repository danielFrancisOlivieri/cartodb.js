var _ = require('underscore');
var sanitize = require('../../core/sanitize');
var Template = require('../../core/template');
var View = require('../../core/view');

var FADE_IN_DURATION = 200;
var FADE_OUT_DURATION = 100;
var FADE_TIMEOUT = 50;

var TooltipView = View.extend({
  defaultTemplate: '<p>{{text}}</p>',
  className: 'CDB-Tooltip-wrapper',

  initialize: function (options) {
    if (!options.mapView) {
      throw new Error('mapView should be present');
    }
    if (!options.layerView) {
      throw new Error('layerView should be present');
    }

    this._mapView = options.mapView;
    this._layerView = options.layerView;

    this._filter = null;
    this.showing = false;
    this.showhideTimeout = null;

    this.model.bind('change:visible', this._showOrHide, this);
    // TODO: pos and position are ambiguous names
    this.model.bind('change:pos', this._updatePosition, this);
    this.model.bind('change:posisition', this._updatePosition, this);
    this.model.bind('change:content change:alternative_names', this.render, this);
  },

  template: function (data) {
    var compiledTemplate = Template.compile(this.model.get('template'), 'mustache');
    return compiledTemplate(data);
  },

  render: function () {
    var content = this.model.get('content');
    if (this._filter && !this._filter(content)) {
      return this;
    }
    var sanitizedOutput = sanitize.html(this.template(content));
    this.$el.html(sanitizedOutput);
    this._updatePosition();
    return this;
  },

  /**
   * sets a filter to open the tooltip. If the feature being hovered
   * pass the filter the tooltip is shown
   * setFilter(null) removes the filter
   */
  setFilter: function (f) {
    this._filter = f;
    return this;
  },

  _showOrHide: function () {
    if (this.model.isVisible()) {
      this._show();
    } else {
      this._hide();
    }
  },

  _hide: function () {
    var self = this;
    var fadeOut = function () {
      self.$el.fadeOut(FADE_OUT_DURATION);
    };

    clearTimeout(this.showhideTimeout);
    this.showhideTimeout = setTimeout(fadeOut, FADE_TIMEOUT);
  },

  _show: function () {
    this.render();

    var self = this;
    var fadeIn = function () {
      self.$el.fadeIn(FADE_IN_DURATION);
    };

    clearTimeout(this.showhideTimeout);
    this.showhideTimeout = setTimeout(fadeIn, FADE_TIMEOUT);
  },

  _updatePosition: function () {
    var point = this.model.get('pos');
    var pos = this.model.get('position');
    var height = this.$el.innerHeight();
    var width = this.$el.innerWidth();
    var mapViewSize = this._mapView.getSize();
    var top = 0;
    var left = 0;
    var modifierClass = 'CDB-Tooltip-wrapper--';

    // Remove any position modifier
    this._removePositionModifiers();

    // Vertically
    if (pos.indexOf('top') !== -1) {
      top = point.y - height;
    } else if (pos.indexOf('middle') !== -1) {
      top = point.y - (height / 2);
    } else { // bottom
      top = point.y;
    }

    // Fix vertical overflow
    if (top < 0) {
      top = point.y;
      modifierClass += 'top';
    } else if (top + height > mapViewSize.y) {
      top = point.y - height;
      modifierClass += 'bottom';
    } else {
      modifierClass += 'top';
    }

    // Horizontally
    if (pos.indexOf('left') !== -1) {
      left = point.x - width;
    } else if (pos.indexOf('center') !== -1) {
      left = point.x - (width / 2);
    } else { // right
      left = point.x;
    }

    // Fix horizontal overflow
    if (left < 0) {
      left = point.x;
      modifierClass += 'Left';
    } else if (left + width > mapViewSize.x) {
      left = point.x - width;
      modifierClass += 'Right';
    } else {
      modifierClass += 'Left';
    }

    // Add offsets
    top += this.model.getVerticalOffset();
    left += this.model.getHorizontalOffset();

    this.$el.css({
      top: top,
      left: left
    }).addClass(modifierClass);
  },

  _removePositionModifiers: function () {
    var positions = [ 'topLeft', 'topRight', 'bottomRight', 'bottomLeft' ];
    var positionModifiers = _.map(positions, function (className) {
      return this._modifierClassName(className);
    }, this);
    this.$el.removeClass(positionModifiers.join(' '));
  },

  _modifierClassName: function (className) {
    return this.className + '--' + className;
  }
});

module.exports = TooltipView;
