var $ = require('jquery');
var _ = require('underscore');
var d3 = require('d3');
var formatter = require('cdb/core/format');
var Model = require('cdb/core/model');
var View = require('cdb/core/view');

module.exports = View.extend({

  defaults: {
    axis_tip: false,
    minimumBarHeight: 2,
    animationSpeed: 750,
    handleWidth: 6,
    handleHeight: 23,
    handleRadius: 3,
    divisionWidth: 80,
    animationBarDelay: function(d, i) {
      return Math.random() * (100 + (i * 10));
    },
    transitionType: 'elastic'
  },

  initialize: function(opts) {
    if (!opts.width) throw new Error('opts.width is required');
    if (!opts.height) throw new Error('opts.height is required');

    this.options = _.extend({}, this.defaults, opts);

    _.bindAll(this, '_selectBars', '_adjustBrushHandles', '_onBrushMove', '_onBrushStart', '_onMouseMove', '_onMouseOut');

    // using tagName: 'svg' doesn't work,
    // and w/o class="" d3 won't instantiate properly
    this.$el = $('<svg class=""></svg>');
    this.el = this.$el[0];

    this.canvas = d3.select(this.el)
    .attr('width',  opts.width)
    .attr('height', opts.height);

    this.canvas
    .append('g')
    .attr('class', 'Canvas');

    this._setupModel();
    this._setupDimensions();
    this._setupD3Bindings();
  },

  render: function() {
    this._generateChart();
    this._generateChartContent();
    return this;
  },

  replaceData: function(data) {
    this.model.set({ data: data });
  },

  _onChangeLeftAxisTip: function() {
    this._updateAxisTip('left');
  },

  _onChangeRightAxisTip: function() {
    this._updateAxisTip('right');
  },

  _updateAxisTip: function(className) {
    var textLabel = this.chart.select('.AxisTip-text.AxisTip-' + className);
    var axisTip  = this.chart.select('.AxisTip.AxisTip-' + className);
    var rectLabel = this.chart.select('.AxisTip-rect.AxisTip-' + className);
    var handle    = this.chart.select('.Handle.Handle-' + className);

    textLabel.data([this.model.get(className + '_axis_tip')]).text(function(d) {
      return formatter.formatNumber(d);
    });

    var width = textLabel.node().getBBox().width;
    rectLabel.attr('width', width + 4);

    var parts = /translate\(\s*([^\s,)]+), ([^\s,)]+)/.exec(handle.attr('transform'));
    var xPos = +parts[1] + 3;

    if ((xPos - width/2) < 0) {
      axisTip.attr('transform', 'translate(0, 52)');
      textLabel.attr('dx', -xPos);
      rectLabel.attr('x',  -xPos);
    } else if ((xPos + width/2 + 2) >= this.chartWidth) {
      axisTip.attr('transform', 'translate(0, 52)');
      textLabel.attr('dx', this.chartWidth - (xPos + width - 2));
      rectLabel.attr('x', this.chartWidth - (xPos + width));
    } else {
      axisTip.attr('transform', 'translate(-' + (width/2) + ', 52)');
      rectLabel.attr('x', 0);
      textLabel.attr('dx', +2);
    }
  },

  _onChangeData: function() {
    if (this.model.previous('data').length != this.model.get('data').length) {
      this.reset();
    } else {
      this.refresh();
    }
  },

  _onChangeRange: function() {
    if (this.model.get('lo_index') === 0 && this.model.get('hi_index') === 0) {
      return;
    }
    this.trigger('range_updated', this.model.get('lo_index'), this.model.get('hi_index'));
  },

  _onChangeWidth: function() {
    var loBarIndex = this.model.get('lo_index');
    var hiBarIndex = this.model.get('hi_index');

    var width = this.model.get('width');

    this.$el.width(width);

    this.chart.attr('width', width);

    this.reset();
    this.selectRange(loBarIndex, hiBarIndex);
  },

  _onChangePos: function() {
    var pos = this.model.get('pos');

    var x = +pos.x;
    var y = +pos.y;

    this.chart
    .transition()
    .duration(150)
    .attr('transform', 'translate(' + (this.margin.left + x) + ', ' + (this.margin.top + y) + ')');
  },

  _onBrushStart: function() {
    var extent = this.brush.extent();
    var hiExtent = extent[1];
    var rightX = this.xScale(hiExtent) - this.options.handleWidth / 2;

    this.chart.classed('is-selectable', true);
  },

  _onChangeDragging: function() {
    this.chart.classed('is-dragging', this.model.get('dragging'));
    this._updateAxisTipOpacity('right');
    this._updateAxisTipOpacity('left');
  },

  _showAxisTip: function(className) {
    var textLabel = this.chart.select('.AxisTip-text.AxisTip-' + className);
    var axisTip   = this.chart.select('.AxisTip.AxisTip-' + className);
    var rectLabel = this.chart.select('.AxisTip-rect.AxisTip-' + className);

    if (textLabel) {
      textLabel.transition().duration(200).attr('opacity',  1);
    }
    if (rectLabel) {
      rectLabel.transition().duration(200).attr('opacity',  1);
    }
  },

  _hideAxisTip: function(className) {
    var textLabel = this.chart.select('.AxisTip-text.AxisTip-' + className);
    var axisTip   = this.chart.select('.AxisTip.AxisTip-' + className);
    var rectLabel = this.chart.select('.AxisTip-rect.AxisTip-' + className);

    if (textLabel) {
      textLabel.transition().duration(200).attr('opacity',  0);
    }
    if (rectLabel) {
      rectLabel.transition().duration(200).attr('opacity',  0);
    }
  },

  _updateAxisTipOpacity: function(className) {
    if (this.model.get('dragging')) {
      this._showAxisTip(className);
    } else {
      this._hideAxisTip(className);
    }
  },

  _onBrushMove: function() {
    this.model.set({ dragging: true });
    this._selectBars();
    this._adjustBrushHandles();
  },

  _onMouseOut: function() {
    var bars = this.chart.selectAll('.Bar');
    bars.classed('is-highlighted', false);
    this.trigger('hover', { value: null });
  },

  _onMouseMove: function() {
    var x = d3.event.offsetX;
    var y = d3.event.offsetY;

    var barIndex = Math.floor(x / this.barWidth);
    var data = this.model.get('data');

    if (data[barIndex] === undefined || data[barIndex] === null) {
      return;
    }

    var freq = data[barIndex].freq;
    var hoverProperties = {};

    var bar = this.chart.select('.Bar:nth-child(' + (barIndex + 1) + ')');

    if (bar && bar.node() && !bar.classed('is-selected')) {

      var left = (barIndex * this.barWidth) + (this.barWidth/2);

      var top = this.yScale(freq) + this.model.get('pos').y + this.$el.position().top - 20;

      var h = this.chartHeight - this.yScale(freq);

      if (h < this.options.minimumBarHeight && h > 0) {
        top = this.chartHeight + this.model.get('pos').y + this.$el.position().top - 20 - this.options.minimumBarHeight;
      }

      if (!this._isDragging() && freq > 0) {
        var d = formatter.formatNumber(freq);
        hoverProperties = { top: top, left: left, data: d };
      } else {
        hoverProperties = null;
      }

    } else {
      hoverProperties = null;
    }

    this.trigger('hover', hoverProperties);

    this.chart.selectAll('.Bar')
    .classed('is-highlighted', false);

    if (bar && bar.node()) {
      bar.classed('is-highlighted', true);
    }
  },

  _bindModel: function() {
    this.model.bind('change:width', this._onChangeWidth, this);
    this.model.bind('change:pos', this._onChangePos, this);
    this.model.bind('change:lo_index change:hi_index', this._onChangeRange, this);
    this.model.bind('change:data', this._onChangeData, this);
    this.model.bind('change:dragging', this._onChangeDragging, this);
    this.model.bind('change:right_axis_tip', this._onChangeRightAxisTip, this);
    this.model.bind('change:left_axis_tip', this._onChangeLeftAxisTip, this);
  },

  reset: function() {
    this._removeChartContent();
    this._setupDimensions();
    this._calcBarWidth();
    this._generateChartContent();
  },

  refresh: function() {
    this._setupDimensions();
    this._removeAxis();
    this._generateAxis();
    this._updateChart();

    this.chart.select('.Handles').moveToFront();
    this.chart.select('.Brush').moveToFront();
  },

  resetIndexes: function() {
    this.model.set({ lo_index: null, hi_index: null });
  },

  _removeBars: function() {
    this.chart.selectAll('.Bars').remove();
  },

  _removeBrush: function() {
    this.chart.selectAll('.Brush').remove();
    this.chart.classed('is-selectable', false);
  },

  _removeLines: function() {
    this.chart.select('.Lines').remove();
  },

  _removeChartContent: function() {
    this._removeBrush();
    this._removeHandles();
    this._removeBars();
    this._removeAxis();
    this._removeLines();
  },

  _generateChartContent: function() {
    this._generateAxis();
    this._generateLines();
    this._generateBars();
    this._generateHandles();
    this._setupBrush();
  },

  resize: function(width) {
    this.model.set('width', width);
  },

  _generateLines: function() {
    this._generateHorizontalLines();

    if (this.options.type !== 'time') {
      this._generateVerticalLines();
    }
  },

  _generateVerticalLines: function() {
    var lines = this.chart.select('.Lines');

    lines.append('g')
    .selectAll('.Line')
    .data(this.verticalRange.slice(1, this.verticalRange.length - 1))
    .enter().append('svg:line')
    .attr('class', 'Line')
    .attr('y1', 0)
    .attr('x1', function(d) { return d; })
    .attr('y2', this.chartHeight)
    .attr('x2', function(d) { return d; });
  },

  _generateHorizontalLines: function() {
    var lines = this.chart.append('g')
    .attr('class', 'Lines');

    lines.append('g')
    .attr('class', 'y')
    .selectAll('.Line')
    .data(this.horizontalRange)
    .enter().append('svg:line')
    .attr('class', 'Line')
    .attr('x1', 0)
    .attr('y1', function(d) { return d; })
    .attr('x2', this.chartWidth)
    .attr('y2', function(d) { return d; });

    this.bottomLine = lines
    .append('line')
    .attr('class', 'Line Line--bottom')
    .attr('x1', 0)
    .attr('y1', this.chartHeight)
    .attr('x2', this.chartWidth - 1)
    .attr('y2', this.chartHeight);
  },

  _setupModel: function() {
    this.model = new Model({
      data: this.options.data,
      width: this.options.width,
      height: this.options.height,
      pos: { x: 0, y: 0 }
    });

    this._bindModel();
  },

   _setupD3Bindings: function() { // TODO: move to a helper

    d3.selection.prototype.moveToBack = function() { 
      return this.each(function() {
        var firstChild = this.parentNode.firstChild;
        if (firstChild) {
          this.parentNode.insertBefore(this, firstChild);
        }
      });
    };

    d3.selection.prototype.moveToFront = function() {
      return this.each(function(){
        this.parentNode.appendChild(this);
      });
    };
  },

  _setupDimensions: function() {
    this.margin = this.options.margin;

    this.canvasWidth  = this.model.get('width');
    this.canvasHeight = this.model.get('height');

    this.chartWidth  = this.canvasWidth - this.margin.left - this.margin.right;
    this.chartHeight = this.model.get('height') - this.margin.top - this.margin.bottom;

    this._setupScales();
    this._setupRanges();
  },

  _setupScales: function() {
    var data = this.model.get('data');

    this.xScale = d3.scale.linear().domain([0, 100]).range([0, this.chartWidth]);
    this.yScale = d3.scale.linear().domain([0, d3.max(data, function(d) { return _.isEmpty(d) ? 0 : d.freq; } )]).range([this.chartHeight, 0]);

    if (!data || !data.length) {
      return;
    }

    if (this.options.type === 'time') {
      this.xAxisScale = d3.time.scale().domain([data[0].start * 1000, data[data.length - 1].end * 1000]).nice().range([0, this.chartWidth]);
    } else {
      this.xAxisScale = d3.scale.linear().range([data[0].start, data[data.length - 1].end]).domain([0, this.chartWidth]);
    }
  },

  _setupRanges: function() {
    var n = Math.round(this.chartWidth / this.options.divisionWidth);
    this.verticalRange = d3.range(0, this.chartWidth + this.chartWidth / n, this.chartWidth / n);
    this.horizontalRange = d3.range(0, this.chartHeight + this.chartHeight / 2, this.chartHeight / 2);
  },

  _calcBarWidth: function() {
    this.barWidth = this.chartWidth / this.model.get('data').length;
  },

  _generateChart: function() {
    this.chart = d3.select(this.el)
    .selectAll('.Canvas')
    .append('g')
    .attr('class', 'Chart')
    .attr('transform', 'translate(' + this.margin.left + ', ' + this.margin.top + ')');

    this.chart.classed(this.options.className || '', true);
  },

  hide: function() {
    this.$el.hide();
  },

  show: function() {
    this.$el.show();
  },

  _selectBars: function() {
    var self = this;
    var extent = this.brush.extent();
    var lo = extent[0];
    var hi = extent[1];


    this.model.set({ lo_index: this._getLoBarIndex(), hi_index: this._getHiBarIndex() });

    this.chart.selectAll('.Bar').classed('is-selected', function(d, i) {
      var a = Math.floor(i * self.barWidth);
      var b = Math.floor(a + self.barWidth);
      var LO = Math.floor(self.xScale(lo));
      var HI = Math.floor(self.xScale(hi));
      var isIn = (a > LO && a < HI) || (b > LO && b < HI) || (a <= LO && b >= HI);
      return !isIn;
    });
  },

  _isDragging: function() {
    return this.model.get('dragging');
  },

  _move: function(pos) {
    this.model.set({ pos: pos });
  },

  expand: function(height) {
    this.canvas.attr('height', this.canvasHeight + height);
    this._move({ x: 0, y: height });
  },

  contract: function(height) {
    this.canvas.attr('height', height);
    this._move({ x: 0, y: 0 });
  },

  removeSelection: function() {
    this.resetIndexes();
    this.chart.selectAll('.Bar').classed('is-selected', false);
    this._removeBrush();
    this._setupBrush();
  },

  selectRange: function(loBarIndex, hiBarIndex) {
    if (!loBarIndex && !hiBarIndex) {
      return;
    }

    var loPosition = this._getBarPosition(loBarIndex);
    var hiPosition = this._getBarPosition(hiBarIndex);

    this._selectRange(loPosition, hiPosition);
  },

  _selectRange: function(loPosition, hiPosition) {
    this.chart.select('.Brush').transition()
    .duration(this.brush.empty() ? 0 : 150)
    .call(this.brush.extent([loPosition, hiPosition]))
    .call(this.brush.event);
  },

  _getLoBarIndex: function() {
    var extent = this.brush.extent();
    return Math.round(this.xScale(extent[0]) / this.barWidth);
  },

  _getHiBarIndex: function() {
    var extent = this.brush.extent();
    return Math.round(this.xScale(extent[1]) / this.barWidth);
  },

  _getBarIndex: function() {
    var x = d3.event.sourceEvent.offsetX;
    return Math.floor(x / this.barWidth);
  },

  _getBarPosition: function(index) {
    var data = this.model.get('data');
    return index * (100 / data.length);
  },

  _setupBrush: function() {
    var self = this;

    var xScale = this.xScale;
    var brush = this.brush = d3.svg.brush().x(this.xScale);

    function onBrushEnd() {
      var data = self.model.get('data');
      var loPosition, hiPosition;

      self.model.set({ dragging: false });

      if (brush.empty()) {
        self.chart.selectAll('.Bar').classed('is-selected', false);
        d3.select(this).call(brush.extent([0, 0]));
      } else {

        var loBarIndex = self._getLoBarIndex();
        var hiBarIndex = self._getHiBarIndex();

        loPosition = self._getBarPosition(loBarIndex);
        hiPosition = self._getBarPosition(hiBarIndex);

        if (!d3.event.sourceEvent) {
          return;
        }

        if (loBarIndex === hiBarIndex) {
          if (hiBarIndex >= data.length) {
            loPosition = self._getBarPosition(loBarIndex - 1);
          } else {
            hiPosition = self._getBarPosition(hiBarIndex + 1);
          }
        }

        self._selectRange(loPosition, hiPosition);
        self.model.set({ lo_index: loBarIndex, hi_index: hiBarIndex });
        self._adjustBrushHandles();
        self._selectBars();

        self.trigger('on_brush_end', self.model.get('lo_index'), self.model.get('hi_index'));
      }

      if (d3.event.sourceEvent && loPosition === undefined && hiPosition === undefined) {
        var barIndex = self._getBarIndex();

        loPosition = self._getBarPosition(barIndex);
        hiPosition = self._getBarPosition(barIndex + 1);

        self.model.set({ lo_index: barIndex, hi_index: barIndex + 1 });
        self._selectRange(loPosition, hiPosition);
        self.trigger('on_brush_end', self.model.get('lo_index'), self.model.get('hi_index'));
      }
    }

    var data = this.model.get('data');

    this.brush
    .on('brushstart', this._onBrushStart)
    .on('brush', this._onBrushMove)
    .on('brushend', onBrushEnd);

    this.chart.append('g')
    .attr('class', 'Brush')
    .call(this.brush)
    .selectAll('rect')
    .attr('y', 0)
    .attr('height', this.chartHeight)
    .on('mouseout', this._onMouseOut)
    .on('mousemove', this._onMouseMove);
  },

  _adjustBrushHandles: function() {
    var extent = this.brush.extent();

    var loExtent = extent[0];
    var hiExtent = extent[1];

    var leftX  = this.xScale(loExtent) - this.options.handleWidth / 2;
    var rightX = this.xScale(hiExtent) - this.options.handleWidth / 2;

    this.chart.select('.Handle-left')
    .attr('transform', 'translate(' + leftX + ', 0)');

    this.chart.select('.Handle-right')
    .attr('transform', 'translate(' + rightX + ', 0)');

    if (this.options.axis_tip) {
      this.model.set({
        left_axis_tip: this.xAxisScale(leftX + 3),
        right_axis_tip: this.xAxisScale(rightX + 3)
      });
    }
  },

  _generateAxisTip: function(className) {

    var handle = this.chart.select('.Handle.Handle-' + className);

    var axisTip = handle.selectAll("g")
    .data([''])
    .enter().append("g")
    .attr('class', 'AxisTip AxisTip-' + className)
    .attr("transform", function(d, i) { return "translate(0,52)"; });

    this.rectLabel = axisTip.append("rect")
    .attr('class', 'AxisTip-rect AxisTip-' + className)
    .attr("height", 12)
    .attr("width", 10);

    this.textLabel = axisTip.append("text")
    .attr('class', 'AxisTip-text AxisTip-' + className)
    .attr("dy", "11")
    .attr("dx", "0")
    .text(function(d) { return d; });
  },

  _generateHandle: function(className) {
    var opts = { width: this.options.handleWidth, height: this.options.handleHeight, radius: this.options.handleRadius };
    var yPos = (this.chartHeight / 2) - (this.options.handleHeight / 2);

    var handle = this.chart.select('.Handles')
    .append('g')
    .attr('class', 'Handle Handle-' + className);

    if (this.options.axis_tip) {
      this._generateAxisTip(className);
    }

    handle
    .append('line')
    .attr('class', 'HandleLine')
    .attr('x1', 3)
    .attr('y1', -4)
    .attr('x2', 3)
    .attr('y2', this.chartHeight + 4);

    if (this.options.handles) {
      handle
      .append('rect')
      .attr('class', 'HandleRect')
      .attr('transform', 'translate(0, ' + yPos + ')')
      .attr('width', opts.width)
      .attr('height', opts.height)
      .attr('rx', opts.radius)
      .attr('ry', opts.radius);

      var y = 21; // initial position of the first grip

      for (var i = 0; i < 3; i++) {
        handle
        .append('line')
        .attr('class', 'HandleGrip')
        .attr('x1', 2)
        .attr('y1', y + i*3)
        .attr('x2', 4)
        .attr('y2', y + i*3);
      }
    }

    return handle;
  },

  _generateHandles: function() {
    this.chart.append('g').attr('class', 'Handles');
    this.leftHandle  = this._generateHandle('left');
    this.rightHandle = this._generateHandle('right');
  },

  _generateHandleLine: function() {
    return this.chart.select('.Handles').append('line')
    .attr('class', 'HandleLine')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', this.chartHeight);
  },

  _removeHandles: function() {
    this.chart.select('.Handles').remove();
  },

  _removeAxis: function() {
    this.canvas.select('.Axis').remove();
  },

  _generateAdjustAnchorMethod: function(ticks) {

    return function(d, i) {
      if (i === 0) {
        return 'start';
      } else if (i === (ticks.length - 1)) {
        return 'end';
      } else {
        return 'middle';
      }
    };
  },

  _generateAxis: function() {
    if (this.options.type === 'time') {
      this._generateTimeAxis();
    } else {
      this._generateNumericAxis();
    }
  },

  _generateNumericAxis: function() {
    var self = this;
    var adjustTextAnchor = this._generateAdjustAnchorMethod(this.verticalRange);

    var axis = this.chart.append('g')
    .attr('class', 'Axis');

    axis
    .append('g')
    .selectAll('.Label')
    .data(this.verticalRange)
    .enter().append("text")
    .attr("x", function(d) { return d; })
    .attr("y", function(d) { return self.chartHeight + 15; })
    .attr("text-anchor", adjustTextAnchor)
    .text(function(d) {
      return formatter.formatNumber(self.xAxisScale(d));
    });
  },

  _generateTimeAxis: function() {

    var self = this;

    var adjustTextAnchor = this._generateAdjustAnchorMethod(this.xAxisScale.ticks());

    var xAxis = d3.svg.axis()
    .orient("bottom")
    .tickPadding(5)
    .innerTickSize(-this.chartHeight)
    .scale(this.xAxisScale)
    .orient('bottom');

    this.canvas.append('g')
    .attr("class", 'Axis')
    .attr("transform", "translate(0," + (this.chartHeight + 5) + ")")
    .call(xAxis)
    .selectAll("text")
    .style("text-anchor", adjustTextAnchor);

    this.canvas.select('.Axis')
    .moveToBack();
  },

  _updateChart: function() {
    var self = this;
    var data = this.model.get('data');

    var bars = this.chart.selectAll('.Bar')
    .data(data);

    bars
    .enter()
    .append('rect')
    .attr('class', 'Bar')
    .attr('data', function(d) { return _.isEmpty(d) ? 0 :  d.freq; })
    .attr('transform', function(d, i) {
      return 'translate(' + (i * self.barWidth) + ', 0 )';
    })
    .attr('y', self.chartHeight)
    .attr('height', 0)
    .attr('width', this.barWidth - 1);

    bars
    .transition()
    .duration(200)
    .attr('height', function(d) {

      if (_.isEmpty(d)) {
        return 0;
      }

      var h = self.chartHeight - self.yScale(d.freq);

      if (h < self.options.minimumBarHeight && h > 0) {
        h = self.options.minimumBarHeight;
      }
      return h;
    })
    .attr('y', function(d) {
      if (_.isEmpty(d)) {
        return self.chartHeight;
      }

      var h = self.chartHeight - self.yScale(d.freq);

      if (h < self.options.minimumBarHeight && h > 0) {
        return self.chartHeight - self.options.minimumBarHeight;
      } else {
        return self.yScale(d.freq);
      }
    });

    bars
    .exit()
    .transition()
    .duration(200)
    .attr('height', function(d) {
      return 0;
    })
    .attr('y', function(d) {
      return self.chartHeight;
    });
  },

  _generateBars: function() {
    var self = this;
    var data = this.model.get('data');

    this._calcBarWidth();

    var bars = this.chart.append('g')
    .attr('transform', 'translate(0, 0)')
    .attr('class', 'Bars')
    .selectAll('.Bar')
    .data(data);

    bars
    .enter()
    .append('rect')
    .attr('class', 'Bar')
    .attr('data', function(d) { return _.isEmpty(d) ? 0 :  d.freq; })
    .attr('transform', function(d, i) {
      return 'translate(' + (i * self.barWidth) + ', 0 )';
    })
    .attr('y', self.chartHeight)
    .attr('height', 0)
    .attr('width', this.barWidth - 1);

    bars
    .transition()
    .ease(this.options.transitionType)
    .duration(this.options.animationSpeed)
    .delay(this.options.animationBarDelay)
    .transition()
    .attr('height', function(d) {

      if (_.isEmpty(d)) {
        return 0;
      }

      var h = self.chartHeight - self.yScale(d.freq);

      if (h < self.options.minimumBarHeight && h > 0) {
        h = self.options.minimumBarHeight;
      }
      return h;
    })
    .attr('y', function(d) {
      if (_.isEmpty(d)) {
        return self.chartHeight;
      }

      var h = self.chartHeight - self.yScale(d.freq);

      if (h < self.options.minimumBarHeight && h > 0) {
        return self.chartHeight - self.options.minimumBarHeight;
      } else {
        return self.yScale(d.freq);
      }
    });
  }
});
