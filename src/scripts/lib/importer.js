//
// Raw data comes in, structured data goes out.
// Incoming formats:
//   A raw CSV string
//   An array of rows
//   An object with appropriate metadata geared to DataComposer
//   A URL returning one of the above with appropriate MIME type
// Outgoing format:
//   An object of columns and properly coerced data for DataCollections
//

var _ = require( 'lodash' ),
    Utils = require( './utils.js' ),
    Column = require( './column.js' ),
    DataTypes = require( './data-types.js' ),
    DataCollection = require( './data-collection.js' ),
    BabyParse = require( 'babyparse' );


// preference order for data types in order of strictest to more lenient
var dataTypeOrder = ['boolean', 'number', 'currency', 'time', 'string'];


var Importers = {
  // Takes in something and dispatches it to an appropriate importer, wrapping
  // it in a promise to allow for async imports

  import: function( source ) {
    return new Promise( function( resolve, reject ) {

      if( _.isString( source ) ) {

        // does it look like a CSV? (needs better matcher...)
        if( source.match( /\n/ ) ) {
          resolve( this.importCSV( source ) );
        } else {
          // this.importURL( source ).then( resolve );
          resolve( this.importURL( source ) );
        }

      } else if( _.isArray( source ) ) {
        resolve( this.importArray( source ) );
      } else {
        resolve( this.importObject( source ) );
      }
    }.bind( this ) );

  },


  // Takes in a string of CSV data
  importCSV: function( csvData ) {
    var parsed = BabyParse.parse( csvData ).data;

    return this.importArray( parsed );
  },


  // Takes in an array of rows, the first being column names
  importArray: function( rows ) {
    var columns = rows[0],
        rawData = rows.slice(1),
        data    = [];

    // turn our columns into proper Column objects
    columns = this.prepColumns( columns, rawData.slice(0,5) );


    // coerce data by column
    _.each( rawData, function( row ) {
      var datum = {};

      _.each( columns, function( col ) {
        datum[col.id] = col.coerce( row[col.order] );
      });

      data.push( datum );
    });

    return new DataCollection({
      columns: columns,
      rows: data
    });
  },


  // takes in an object of the form
  //   columns: [array, of, columns] with name and optionally type
  //   data: array of rows ( either arrays or objects )
  importObject: function( obj ) {
    var data = obj.data,
        columns = obj.columns,
        dataKeys = [],
        useKeys;

    // turn our columns into proper Column objects
    columns = this.prepColumns( columns, data.slice(0,5) );

    // create tools to let us iterate over an array or an object as needed
    useKeys = !( data[0] instanceof Array );

    // coerce and normalize the data
    data = _.map( data, function( datum ) {
      var out = {};
      _.each( columns, function( column ) {
        var key = useKeys ? column.name : column.order;
        out[column.id] = column.coerce( datum[ key ] );
      });
      return out;
    });

    return new DataCollection({
      columns: columns,
      rows: data
    });
  },


  // Takes in a URL and delegates the result to another importer
  importURL: function( url ) {
    var success = this.importObject.bind(this);

    return Utils.getJSON( url )
    .then(
      // success
      success,

      // error
      function( error ) {
        alert( "There was an error:\n\n"+error );
      }
    );

  },




  /**
   * Adds a type to columns
   *
   * @param {array} columns - Array of columns
   * @param {object|array} dataSample - A few rows of data to detect the type from
   */
  detectDataTypes: function( columns, dataSample ) {
    return _.map( columns, function( column ) {
      var types, sampleRow;

      // see if it's already defined
      if( _.has( column, "type" ) ) { return column; }

      if( _.isArray( dataSample[0] ) ) {
        sampleRow = _.pluck( dataSample, _.indexOf( columns, column ) );
      } else {
        sampleRow = _.pluck( dataSample, column.name );
      }

      types = _.map( sampleRow, function( sampleVal ) {
        return _.find( dataTypeOrder, function( type ) {
          return DataTypes[type].test( sampleVal );
        });
      });

      if( _.every( types, function( x ){ return x === types[0]; }) ) {
        // all the data types are the same; run with it
        column.type = types[0];
      } else {
        column.type = 'string';
      }
      return column;
    });
  },


  prepColumns: function( columns, dataSample ) {
    var finalColumns = {};

    // do we just have a pile of strings?
    if( _.isString( columns[0] ) ) {
      columns = _.map( columns, function( column ) { return { name: column }; });
    }

    // do we know the column types?
    columns = this.detectDataTypes( columns, dataSample );

    // create column objects
    var idx = 0;
    columns = _.each( columns, function( column ) {
      column.order = idx;
      column = new Column( column );
      finalColumns[column.id] = column;
      ++idx;
    });

    return finalColumns;
  }
};


module.exports = Importers;