
/* globals jQuery, _, socssOptions, Backbone, CodeMirror, console, cssjs */

( function( $, _, socssOptions ){

    var socss = {
        model : { },
        collection : { },
        view : { },
        fn : {}
    };

    window.socss = socss;

    /**
     * The toolbar view
     */
    socss.view.toolbar = Backbone.View.extend( {

        button: _.template('<li><a href="#" class="toolbar-button"><%= text %></a></li>'),

        initialize: function(){
            var thisView = this;
            this.$('.editor-expand').click(function(e){
                e.preventDefault();
                $(this).blur();
                thisView.trigger('click_expand');
            } );

            this.$('.editor-visual').click(function(e){
                e.preventDefault();
                $(this).blur();
                thisView.trigger('click_visual');
            } );
        },

        render: function(){

        },

        addButton: function( text, action ){
            var thisView = this;
            var button = $( this.button( { text: text } ) )
                .appendTo( this.$( '.toolbar-function-buttons .toolbar-buttons' ) )
                .click(function(e){
                    e.preventDefault();
                    $(this).blur();
                    thisView.trigger('click_' + action);
                });

            return button;
        }
    } );

    /**
     * The editor view, which handles codemirror stuff
     */
    socss.view.editor = Backbone.View.extend( {

        codeMirror : null,
        snippets: null,
        toolbar: null,
        visualProperties: null,

        inspector: null,

        cssSelectors: [],

        initialize: function( args ){
            this.setupEditor();
        },

        render: function(){
            var thisView = this;

            // Setup the toolbar
            this.toolbar = new socss.view.toolbar( {
                el: this.$('.custom-css-toolbar')
            } );
            this.toolbar.render();

            // Create the visual properties view
            this.visualProperties = new socss.view.properties( {
                el: $('#so-custom-css-properties')
            } );
            this.visualProperties.editor = this;
            this.visualProperties.render();

            this.toolbar.on('click_expand', function(){
                thisView.toggleExpand();
            });

            this.toolbar.on('click_visual', function(){
                thisView.visualProperties.loadCSS( thisView.codeMirror.getValue() );
                thisView.visualProperties.show();
            });

            this.preview = new socss.view.preview( {
                editor: this,
                el: this.$('.custom-css-preview')
            } );
            this.preview.render();
        },

        /**
         * Do the initial setup of the CodeMirror editor
         */
        setupEditor: function( ) {
            var thisView = this;

            this.registerCodeMirrorAutocomplete();

            // Setup the Codemirror instance
            this.codeMirror = CodeMirror.fromTextArea( this.$el.find('textarea.css-editor').get( 0 ), {
                tabSize : 2,
                mode: 'css',
                theme:'neat',
                gutters: [
                    "CodeMirror-lint-markers"
                ],
                lint: true
            } );

            // Set the container to visible overflow once the editor is setup
            this.$el.find('.custom-css-container').css('overflow', 'visible');
            this.scaleEditor();

            // Scale the editor whenever the window is resized
            $(window).resize(function(){
                thisView.scaleEditor();
            });

            // Setup the extensions
            this.setupCodeMirrorExtensions();
        },

        /**
         * Register the autocomplete helper. Based on css-hint.js in the codemirror addon folder.
         */
        registerCodeMirrorAutocomplete: function(){
            var thisView = this;

            var pseudoClasses = {link: 1, visited: 1, active: 1, hover: 1, focus: 1,
                "first-letter": 1, "first-line": 1, "first-child": 1,
                before: 1, after: 1, lang: 1};

            CodeMirror.registerHelper("hint", "css", function(cm) {
                var cur = cm.getCursor(), token = cm.getTokenAt(cur);
                var inner = CodeMirror.innerMode(cm.getMode(), token.state);
                if (inner.mode.name !== "css") {
                    return;
                }

                if (token.type === "keyword" && "!important".indexOf(token.string) === 0){
                    return {list: ["!important"], from: CodeMirror.Pos(cur.line, token.start),
                        to: CodeMirror.Pos(cur.line, token.end)};
                }

                var start = token.start, end = cur.ch, word = token.string.slice(0, end - start);
                if (/[^\w$_-]/.test(word)) {
                    word = ""; start = end = cur.ch;
                }

                var spec = CodeMirror.resolveMode("text/css");

                var result = [];
                function add(keywords) {
                    for (var name in keywords){
                        if ( !word || name.lastIndexOf(word, 0) === 0 ){
                            result.push(name);
                        }
                    }
                }

                var st = inner.state.state;

                if ( st === 'top' ) {
                    // We're going to autocomplete the selector using our own set of rules
                    var line = cm.getLine(cur.line).trim();

                    var selectors = thisView.cssSelectors;
                    for( var i = 0; i < selectors.length; i++ ) {
                        if( selectors[i].selector.indexOf(line) !== -1 ) {
                            result.push( selectors[i].selector );
                        }
                    }

                    if (result.length) {
                        return {
                            list: result,
                            from: CodeMirror.Pos(cur.line, 0),
                            to: CodeMirror.Pos(cur.line, end)
                        };
                    }
                }
                else {

                    if (st === "pseudo" || token.type === "variable-3") {
                        add( pseudoClasses );
                    }
                    else if (st === "block" || st === "maybeprop") {
                        add( spec.propertyKeywords );
                    }
                    else if (st === "prop" || st === "parens" || st === "at" || st === "params") {
                        add( spec.valueKeywords );
                        add( spec.colorKeywords );
                    }
                    else if (st === "media" || st === "media_parens") {
                        add( spec.mediaTypes );
                        add( spec.mediaFeatures );
                    }

                    if (result.length) {
                        return {
                            list: result,
                            from: CodeMirror.Pos(cur.line, start),
                            to: CodeMirror.Pos(cur.line, end)
                        };
                    }

                }

            });
        },

        setupCodeMirrorExtensions: function(){
            var thisView = this;

            this.codeMirror.on('cursorActivity', function(cm){
                var cur = cm.getCursor(), token = cm.getTokenAt(cur);
                var inner = CodeMirror.innerMode(cm.getMode(), token.state);

                // console.log( token );
                // console.log( inner.state.state );

                // If we have a qualifier selected, then highlight that in the preview
                if( token.type === 'qualifier' || token.type === 'tag' || token.type === 'builtin' ) {
                    var line = cm.getLine( cur.line );
                    var selector = line.substring( 0, token.end );

                    thisView.preview.highlight( selector );
                }
                else {
                    thisView.preview.clearHighlight();
                }
            } );

            // This sets up automatic autocompletion at all times
            this.codeMirror.on('keyup', function(cm, e){
                if(
                    ( e.keyCode >= 65 && e.keyCode <= 90 ) ||
                    ( e.keyCode === 189 && !e.shiftKey ) ||
                    ( e.keyCode === 190  && !e.shiftKey ) ||
                    ( e.keyCode === 51 && e.shiftKey ) ||
                    ( e.keyCode === 189 && e.shiftKey )
                ) {
                    cm.showHint(e);
                }
            });
        },

        /**
         * Scale the size of the editor depending on whether it's expanded or not
         */
        scaleEditor: function(){
            if( this.$el.hasClass('expanded') ) {
                // If we're in the expanded view, then resize the editor
                this.codeMirror.setSize('100%', $(window).outerHeight() - this.$('.custom-css-toolbar').outerHeight() );
            }
            else {
                this.codeMirror.setSize('100%', 'auto');
            }
        },

        /**
         * Check if the editor is in expanded mode
         * @returns {*}
         */
        isExpanded: function(){
            return this.$el.hasClass('expanded');
        },

        /**
         * Toggle if this is expanded or not
         */
        toggleExpand: function(){
            this.$el.toggleClass('expanded');
            this.scaleEditor();
        },

        /**
         * Set the expanded state of the editor
         * @param expanded
         */
        setExpand: function( expanded ){
            if( expanded ) {
                this.$el.addClass('expanded');
            }
            else {
                this.$el.removeClass('expanded');
            }
            this.scaleEditor();
        },

        /**
         * Set the snippets available to this editor
         */
        setSnippets: function( snippets ){
            if( ! _.isEmpty( snippets ) ) {
                var thisView = this;

                this.snippets = new socss.view.snippets( {
                    snippets: snippets
                } );
                this.snippets.editor = this;

                this.snippets.render();
                this.toolbar.addButton('Snippets', 'snippets');
                this.toolbar.on('click_snippets', function(){
                    thisView.snippets.show();
                });
            }
        },

        addCode: function( css ){
            var editor = this.codeMirror;

            var before_css = '';
            if( editor.doc.lineCount() === 1 && editor.doc.getLine( editor.doc.lastLine() ).length === 0 ) {
                before_css = "";
            }
            else if( editor.doc.getLine( editor.doc.lastLine() ).length === 0 ) {
                before_css = "\n";
            }
            else {
                before_css = "\n\n";
            }

            // Now insert the code in the editor
            editor.doc.setCursor(
                editor.doc.lastLine(),
                editor.doc.getLine( editor.doc.lastLine() ).length
            );
            editor.doc.replaceSelection( before_css + css );
        },

        addEmptySelector: function( selector ) {
            this.addCode( selector + " {\n  \n}" );
        },

        /**
         * This function lets an inspector let a
         */
        setInspector: function( inspector ){
            var thisView = this;
            this.inspector = inspector;
            this.cssSelectors = inspector.pageSelectors;

            inspector.on('click_selector', function(selector){
                thisView.addEmptySelector( selector );
            });

            inspector.on('click_property', function( property ){
                thisView.codeMirror.replaceSelection( property + ";\n  " );
            });
        },

        selectedBlock: '',

        /**
         * Forces CodeMirror to select the current block.
         *
         * @todo improve this so we can click outside the selector
         */
        selectCurrentBlock: function(){
            var cm = this.codeMirror;
            var cur, token, inner;

            cur = cm.getCursor();
            token = cm.getTokenAt(cur);
            inner = CodeMirror.innerMode(cm.getMode(), token.state);

            if( inner.state.state === 'top' ) {
                return false;
            }

            while( inner.state.state !== 'top' ) {
                cm.execCommand('goGroupLeft');

                cur = cm.getCursor();
                token = cm.getTokenAt(cur);
                inner = CodeMirror.innerMode(cm.getMode(), token.state);
            }

            var startCur = cm.getCursor();

            cm.execCommand('goGroupRight');
            cur = cm.getCursor();
            token = cm.getTokenAt(cur);
            inner = CodeMirror.innerMode(cm.getMode(), token.state);
            while( inner.state.state !== 'top' ) {
                cm.execCommand('goGroupRight');
                cur = cm.getCursor();
                token = cm.getTokenAt(cur);
                inner = CodeMirror.innerMode(cm.getMode(), token.state);
            }

            var endCur = cm.getCursor();

            cm.setSelection( startCur, endCur );
            return cm.getSelection();
        }

    } );

    /**
     * The preview.
     */
    socss.view.preview = Backbone.View.extend( {

        template: _.template('<iframe class="preview-iframe"></iframe>'),
        editor: null,

        initialize: function( attr ){
            this.editor = attr.editor;

            var thisView = this;
            this.editor.codeMirror.on('change', function(cm, c){
                thisView.updatePreviewCss();
            });
        },

        render: function(){
            var thisView = this;

            this.$el.html( this.template() );

            this.$('.preview-iframe')
                .attr( 'src', socssOptions.homeURL )
                .load( function(){
                    var $$ = $(this);
                    $$.contents().find('a').each( function(){
                        var href = $(this).attr('href');
                        if( href === undefined ) {
                            return true;
                        }

                        var firstSeperator = (href.indexOf('?') === -1 ? '?' : '&');
                        $(this).attr('href', href + firstSeperator + 'so_css_preview=1' );
                    } );

                    thisView.updatePreviewCss();
                } )
                .mouseleave( function(){
                    thisView.clearHighlight();
                } );
        },

        updatePreviewCss: function(){
            var preview = this.$('.preview-iframe');
            if( preview.length === 0 ) {
                return;
            }

            if( !preview.is(':visible') ) {
                return;
            }

            var head = preview.contents().find('head');
            if( head.find('style.siteorigin-custom-css').length === 0 ) {
                head.append('<style class="siteorigin-custom-css" type="text/css"></style>');
            }
            var style = head.find('style.siteorigin-custom-css');

            // Update the CSS after a short delay
            var css = this.editor.codeMirror.getValue();
            style.html(css);
        },

        /**
         * Highlight all elements with a given selector
         */
        highlight: function( selector ){
            try {
                this.editor.inspector.hl.highlight( selector );
            }
            catch (err) {
                console.log('No inspector to highlight with');
            }
        },

        clearHighlight: function(){
            try {
                this.editor.inspector.hl.clear();
            }
            catch (err) {
                console.log('No inspector to highlight with');
            }
        }

    } );

    /**
     * The dialog for the snippets browser
     */
    socss.view.snippets = Backbone.View.extend( {
        template: _.template( $('#template-snippet-browser').html() ),
        snippet: _.template('<li class="snippet"><%- name %></li>'),
        className: 'css-editor-snippet-browser',
        snippets: null,
        editor: null,

        events: {
            'click .close' : 'hide',
            'click .buttons .insert-snippet' : 'insertSnippet'
        },

        currentSnippet: null,

        initialize: function( args ){
            this.snippets = args.snippets;
        },

        render: function(){
            var thisView = this;


            var clickSnippet = function(e){
                e.preventDefault();
                var $$ = $(this);

                thisView.$('.snippets li.snippet').removeClass('active');
                $(this).addClass('active');
                thisView.viewSnippet({
                    name: $$.html(),
                    description: $$.data('description'),
                    css: $$.data('css')
                });
            };

            this.$el.html( this.template() );
            for( var i = 0; i < this.snippets.length; i++ ) {
                $( this.snippet( { name: this.snippets[i].Name } ) )
                    .data({
                        'description': this.snippets[i].Description,
                        'css': this.snippets[i].css
                    })
                    .appendTo( this.$('ul.snippets') )
                    .click( clickSnippet );
            }

            // Click on the first one
            thisView.$('.snippets li.snippet').eq(0).click();

            this.attach();
            return this;
        },

        viewSnippet: function( args ){
            var w = this.$('.main .snippet-view');

            w.find('.snippet-title').html( args.name );
            w.find('.snippet-description').html( args.description );
            w.find('.snippet-code').html( args.css );

            this.currentSnippet = args;
        },

        insertSnippet: function(){
            var editor = this.editor.codeMirror;
            var css = this.currentSnippet.css;

            var before_css = '';
            if( editor.doc.lineCount() === 1 && editor.doc.getLine( editor.doc.lastLine() ).length === 0 ) {
                before_css = "";
            }
            else if( editor.doc.getLine( editor.doc.lastLine() ).length === 0 ) {
                before_css = "\n";
            }
            else {
                before_css = "\n\n";
            }

            // Now insert the code in the editor
            editor.doc.setCursor(
                editor.doc.lastLine(),
                editor.doc.getLine( editor.doc.lastLine() ).length
            );
            editor.doc.replaceSelection( before_css + css );

            this.hide();
        },

        attach: function(){
            this.$el.appendTo('body');
        },

        show: function(){
            this.$el.show();
        },

        hide: function(){
            this.$el.hide();
        }
    } );


    /**
     * The visual properties editor
     */
    socss.view.properties = Backbone.View.extend( {

        model: socss.model.cssRules,

        tabTemplate: _.template('<li data-section="<%- id %>"><span class="dashicons dashicons-<%- icon %>"></span> <%- title %></li>'),
        sectionTemplate: _.template('<div class="section" data-section="<%- id %>"><table class="fields-table"><tbody></tbody></table></div>'),
        controllerTemplate: _.template('<tr><th scope="row"><%- title %></th><td></td></tr>'),

        /**
         * The controllers for each of the properties
         */
        propertyControllers: {},

        /**
         * The editor view
         */
        editor: null,

        /**
         * The current, raw CSS
         */
        css: '',

        /**
         * Parsed CSS
         */
        parsed: {},

        /**
         * The current active selector
         */
        activeSelector: '',

        /**
         * Was the editor expanded before we went into the property editor
         */
        editorExpandedBefore : false,

        events: {
            'click .close' : 'hide'
        },

        /**
         * Initialize the properties editor with a new model
         */
        initialize: function(){
            var thisView = this;
            this.parser = new cssjs();
        },

        /**
         * Render the property editor
         */
        render: function(){
            var thisView = this;

            var controllers = socssOptions.propertyControllers;

            for( var id in controllers ) {
                // Create the tabs
                var $t = $( this.tabTemplate({
                    id: id,
                    icon: controllers[id].icon,
                    title: controllers[id].title
                })).appendTo( this.$('.section-tabs') );

                // Create the sections wrappers
                var $s = $( this.sectionTemplate({
                    id: id
                })).appendTo( this.$('.sections') );

                // Now lets add the controllers
                if( ! _.isEmpty( controllers[id].controllers ) ) {

                    for( var prop in controllers[id].controllers ) {
                        var $c = $(thisView.controllerTemplate({
                            title: controllers[id].controllers[prop].title
                        })).appendTo($s.find('tbody'));

                        var controller;
                        if( typeof socss.view.properties.controllers[ controllers[id].controllers[prop].type ] === 'undefined' ) {
                            controller = new socss.view.propertyController({
                                el: $c.find('td')
                            });
                        }
                        else {
                            controller = new socss.view.properties.controllers[ controllers[id].controllers[prop].type ]({
                                el: $c.find('td')
                            });
                        }

                        thisView.propertyControllers[prop] = controller;

                        // Setup and render the controller
                        controller.render();
                        controller.on('change', function(val){
                            this.editor.codeMirror.setValue( this.parser.getCSSForEditor( this.parsed ) );
                        }, thisView);
                    }
                }
            }

            // Setup the tab switching
            this.$('.section-tabs li').click(function(){
                var $$ = $(this);
                var show = thisView.$('.sections .section[data-section="' + $$.data('section') + '"]');

                thisView.$('.sections .section').not( show ).hide().removeClass('active');
                show.show().addClass('active');

                thisView.$('.section-tabs li').not($$).removeClass('active');
                $$.addClass('active');
            }).eq(0).click();

            this.$('.toolbar select').change( function(){
                thisView.setActivateSelector( $(this).val(), $(this).find(':selected').data('selector') );
            } );

        },

        /**
         * Show the properties editor
         */
        show: function(){
            this.editorExpandedBefore = this.editor.isExpanded();
            this.editor.setExpand( true );
            this.$el.show();
        },

        /**
         * Hide the properties editor
         */
        hide: function(){
            this.editor.setExpand( this.editorExpandedBefore );
            this.$el.hide();
        },

        /**
         * Loads a single CSS selector and associated properties into the model
         * @param css
         */
        loadCSS: function(css, activeSelector) {
            this.css = css;
            this.parsed = this.parser.compressCSS( this.parser.parseCSS( css ) );

            // Add the dropdown menu items
            var dropdown = this.$('.toolbar select').empty();
            for( var i = 0; i < this.parsed.length; i++ ) {
                dropdown.append(
                    $('<option>')
                        .html( this.parsed[i].selector )
                        .attr('val', this.parsed[i].selector)
                        .data('selector', this.parsed[i])
                );
            }

            if( typeof activeSelector === 'undefined' ) {
                activeSelector = dropdown.find('option').eq(0).attr('val');
            }

            dropdown.val( activeSelector ).change();
        },

        /**
         * Set the selector that we're currently dealing with
         * @param selector
         */
        setActivateSelector: function( id, selector ){
            // Get the rules in the current selector
            var ruleValues = {}, ruleObjects = {};
            for( var i = 0; i < selector.rules.length; i++ ) {
                ruleValues[ selector.rules[i].directive ] = selector.rules[i].value;
                ruleObjects[ selector.rules[i].directive ] = selector.rules[i];
            }

            // Either setup or reset the property controllers with the values from this rule
            for( var k in this.propertyControllers ) {
                if( typeof ruleValues[k] !== 'undefined' ) {
                    this.propertyControllers[k].activeRule = ruleObjects[k];
                    this.propertyControllers[k].setValue( ruleValues[k], {silent: true} );
                }
                else {
                    var newRule = {
                        directive: k,
                        value : ''
                    };
                    this.propertyControllers[k].activeRule = newRule;
                    selector.rules.push( newRule );

                    this.propertyControllers[k].reset( {silent: true} );
                }
            }
        }

    } );

    socss.view.propertyController = Backbone.View.extend( {

        template: _.template('<input type="text" value="" />'),
        activeRule: null,

        initialize: function( ){
            var updateActiveRule = function(value){
                // When the value is changed, we'll also change the active rule
                if(this.activeRule === null) {
                    return;
                }
                this.activeRule.value = value;
            };

            this.on('set_value', updateActiveRule, this);
            this.on('change', updateActiveRule, this);
        },

        /**
         * Render the property field controller
         */
        render: function(){
            this.$el.append( $( this.template( {} ) ) );
            this.field = this.$('input');
        },

        /**
         * Get the current value
         * @return string
         */
        getValue: function(){
            return this.field.val();
        },

        /**
         * Set the current value
         * @param socss.view.properties val
         */
        setValue: function(val, options) {
            options = _.extend( { silent: false }, options );

            this.field.val(val);

            if( !options.silent ) {
                this.trigger('set_value', val);
            }
        },

        /**
         * Reset the current value
         */
        reset: function( options ){
            options = _.extend( { silent: false }, options );

            this.setValue('', options);
        }

    } );

    // All the controllers
    socss.view.properties.controllers = {

        // The color property controller
        color: socss.view.propertyController.extend({

            template: _.template('<input type="text" value="" />'),

            render: function(){
                var thisView = this;

                var input = $( this.template( {} ) );
                input.on( 'change keyup', function(){
                    thisView.trigger( 'change', input.minicolors( 'value') );
                } );

                this.$el.append( input );

                // Set this up as a color picker
                this.field = this.$el.find('input');
                this.field.minicolors( {} );

            },

            getValue: function(){
                return this.field.minicolors( 'value' );
            },

            setValue: function( val, options ){
                options = _.extend( { silent: false }, options );

                this.field.minicolors( 'value', val);

                if( !options.silent ) {
                    this.trigger('set_value', val);
                }
            }

        })

    };

    socss.fn = {
        quoteattr: function (s, preserveCR) {
            preserveCR = preserveCR ? '&#13;' : '\n';
            return ('' + s) /* Forces the conversion to string. */
                .replace(/&/g, '&amp;') /* This MUST be the 1st replacement. */
                .replace(/'/g, '&apos;') /* The 4 other predefined entities, required. */
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                /*
                 You may add other replacements here for HTML only
                 (but it's not necessary).
                 Or for XML, only if the named entities are defined in its DTD.
                 */
                .replace(/\r\n/g, preserveCR) /* Must be before the next replacement. */
                .replace(/[\r\n]/g, preserveCR);
        }
    };

} ) ( jQuery, _, socssOptions );

// Setup the main editor
jQuery( function($){
    var socss = window.socss;

    // Setup the editor
    var editor = new socss.view.editor( {
        el : $('#so-custom-css-form').get(0)
    } );
    editor.render();
    editor.setSnippets( socssOptions.snippets );

    window.socss.mainEditor = editor;
} );