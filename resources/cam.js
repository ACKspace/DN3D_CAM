
(function()
{
    "use strict"

    var messages = {
        "LoadingDirectory"  : "booting mainframe..",
        "Loading"           : "connecting..",
        "Offline"           : "offline",
        "DirectoryError"    : "mainframe error",
        "URIError"          : "could not establish uplink",
        "ParserError"       : "could not decode uplink",
        "APIError"          : "could not connect to cam",
        "CamLoadPrefix"     : ":",
        "CamFailPrefix"     : ".",
        "Empty"             : "&lt;empty&gt;",
        "Corrupt"           : "&lt;corrupt&gt;"
    };

    // Feature sniffing
    if ( !( "onload" in XMLHttpRequest.prototype ) )
    {
        window.console && console.error( "old XMLHttpRequest, please upgrade your browser" );
        return;
    }

    //var camDirectoryURI = "http://spaceapi.net/directory.json?filter=cam";
    var camDirectoryURI = "https://spaceapi.fixme.ch/directory.json";

    var camSwitchSound = new Audio("resources/dn3dcamswitchsound.mp3");
    var camDirectory = null;
    var activeCamURI = null;
    var nCurrentSpace = -1;
    var nCurrentCam = -1;
    var m_img = null;
    var bOff = true;
    var bZoom = true;
    var bDebug = false;
    var timer = null;
    var bHelp = true;
    var nScanDelay = 10;
    var nScanProgress = null;
    var arrBookmarks = [];
    var ls;
    if ( typeof( Storage ) !== "undefined" )
    {
        if ( localStorage.bookmarks )
        arrBookmarks = JSON.parse( localStorage.bookmarks );
    }

	window.addEventListener( "load", onload, false );
    window.addEventListener( "keydown", onkeypress, false );

	function onload( _evt )
	{
        startNoise();

        // Load webcam index
        //http://spaceapi.net/directory.json?filter=cam
        var xhr = new XMLHttpRequest( );

	    xhr.addEventListener( "load", xhr_onload, false );
        xhr.addEventListener( "error", function( _evt )
        {
            switchCamOff( messages.DirectoryError );
        } );

        //xhr.withCredentials = true;
        xhr.open( "GET", camDirectoryURI, true );
        xhr.send( null );
	}

	function onkeypress( _evt )
	{
        switch ( _evt.which || _evt.keyCode )
        {
            case 27: // esc, stop/eject (timer/camera)
                if ( !timerOff( ) )
                    switchCamOff( messages.Offline );
                break;

            case 32: // space
            case 39: // right
                timerOff( );

                camForward( );
                break;

            case 8:  // backspace
            case 37: // left
                timerOff( );

                camBackward( );
                break;

            case 38: // up, previous cam in same space
                timerOff( );

                camBackward( true );
                break;

            case 40: // down, next cam in same space
                timerOff( );

                camForward( true );
                break;

            // 0-9: direct cam (bookmarked)
            // (shift)0-9: direct cam within space
            // (ctrl)0-9: bookmark cam
            case 48: // 0
            case 49: // 1
            case 50: // 2
            case 51: // 3
            case 52: // 4
            case 53: // 5
            case 54: // 6
            case 55: // 7
            case 56: // 8
            case 57: // 9
                if ( _evt.ctrlKey )
                {
                    // Put a bookmark without the URI
                    setBookmark( (_evt.which || _evt.keyCode) - 48, nCurrentSpace, nCurrentCam, null, camDirectory[ bookmark.CurrentSpace ].name );
                } else {
                    // Check if bookmark is stored
                    if ( !arrBookmarks[ (_evt.which || _evt.keyCode) - 48 ] )
                        return;

                    var bookmark = arrBookmarks[ (_evt.which || _evt.keyCode) - 48 ];


                    // Bookmarked space out of bounds

                    var URI = bookmark.URI || null;
                    if ( bookmark.CurrentSpace < camDirectory.length && bookmark.CurrentCam < camDirectory[ bookmark.CurrentSpace ].cam.length)
                    {
                        nCurrentSpace = bookmark.CurrentSpace;
                        nCurrentCam = bookmark.CurrentCam;
                        URI = URI || camDirectory[ nCurrentSpace ].cam[ nCurrentCam ];
                    }

                    if ( !URI )
                        return;

                    // Navigate
                    timerOff( );
                    switchCam( URI, false, bookmark.name );
                }

                break;

            case 66: // b: show bookmarks
                showBookmarks();
                break;

            case 67: // c: overview
                timerOff( );
                break;

            case 68: // d: debug
                bDebug = !bDebug;

                var strCamLabel = messages.Offline;
                if ( nCurrentSpace >= 0 )
                {
                    strCamLabel = camDirectory[ nCurrentSpace ].name;
                    if ( camDirectory[ nCurrentSpace ].cam.length > 1 )
                        strCamLabel += " " + ( nCurrentCam + 1 );
                }

                updateCamLabel( strCamLabel );

                console.log( "Debug", bDebug ? "on" : "off" );
                break;

            case 72: // h: help
                bHelp = !bHelp;
                document.getElementById( "help" ).className = bHelp ? "show" : "";
                break;

            case 82: // r: reload
                // TODO: reload doesn't take custom URI into account
                if ( nCurrentSpace >= 0 )
                    switchCam( camDirectory[ nCurrentSpace ].cam[ nCurrentCam ], true );
                break;

            case 83: // s: scan
                if ( timer )
                {
                    timerOff( );
                }
                else
                {
                    timerUpdate( );
                }

                break;

            case 90: // z: toggle zoom
                updateBackGround( bOff, !bZoom, null );

                if ( nCurrentSpace >= 0 )
                {
                    var strCamLabel = camDirectory[ nCurrentSpace ].name;
                    if ( camDirectory[ nCurrentSpace ].cam.length > 1 )
                        strCamLabel += " " + ( nCurrentCam + 1 );

                    updateCamLabel( strCamLabel );
                }

                break;

            default:
                console.log( _evt.key, "key", _evt.which || _evt.keyCode );
                return true;
        }

        _evt.preventDefault();
        return false;
	}

    function timerTick( _evt )
    {
        if ( !--nScanProgress )
        {
            nScanProgress = nScanDelay;
            camForward( );
        }

        timerUpdate( );
    }

    function timerUpdate( )
    {
        if ( !timer )
        {
            timer = setInterval( timerTick, 1000 );
            nScanProgress = 1;
        }

        document.getElementById( "progress" ).innerText = " [";
        document.getElementById( "progress" ).innerText += new Array( nScanDelay - nScanProgress + 1 ).join( "#" );
        document.getElementById( "progress" ).innerText += new Array( nScanProgress + 1 ).join( "_" );
        document.getElementById( "progress" ).innerText += "]";
    }

    function timerOff( )
    {
        if ( !timer )
            return false;

        clearInterval( timer );
        timer = null;
        document.getElementById( "progress" ).innerText = "";
        return true;
    }

    function determineSpaceData( _bForward, _callBack )
    {
        if ( nCurrentSpace === -1 )
            nCurrentSpace = _bForward ? 0 : camDirectory.length - 1;

        return loadSpaceAPI( nCurrentSpace, _callBack );
    }

    function loadSpaceAPI( _nSpace, _callBack, _bReadOnly, _withCredentials )
    {
        if ( !camDirectory || !( _nSpace in camDirectory) )
            return false;

        if ( "cam" in camDirectory[ _nSpace ] )
        {
            (typeof _callBack === "function" ) && _callBack.call( this, camDirectory[ nCurrentSpace ] );
            return true;
        }

        var xhr = new XMLHttpRequest( );

        xhr.addEventListener( "load", function( _evt )
        {
            var spaceAPI = null;
            try
            {
                spaceAPI = JSON.parse( _evt.target.responseText );
            } catch( _e ) {
                switchCamOff( messages.APIError );
                //delete camDirectory[ _nSpace ];
                // Create dummy object so that the callback will be executed somewhat safely
                spaceAPI = { "open" : null, "cam" : [] };
            }

            /*if ( !spaceAPI || !spaceAPI.cam || !spaceAPI.cam.length )
                return false;*/
            if ( !spaceAPI.cam )
            {
                switchCamOff( messages.APIError );
                //delete camDirectory[ _nSpace ];
                // Create dummy object so that the callback will be executed somewhat safely
                spaceAPI = { "open" : null, "cam" : [] };
            }

            // Copy over the cam URIs
            camDirectory[ _nSpace ].cam = spaceAPI.cam.slice( 0 );

            // While we're at it, copy some extra information as well.
            camDirectory[ _nSpace ].state = spaceAPI.state || { "open" : spaceAPI.open || null };

            (typeof _callBack === "function" ) && _callBack.call( this, camDirectory[ _nSpace ] );
        }, false );
        xhr.addEventListener( "error", function( _evt )
        {
            if ( false && !_withCredentials )
            {
                loadSpaceAPI( _nSpace, _callBack, _bReadOnly, true );
            }
            else
            {
                // Failed to load the current SpaceAPI
                // Show error and remove the entry as it is useless
                if ( !_bReadOnly )
                    camDirectory.splice( _nSpace, 1 );
                // TODO:
                //switchCamOff( messages.URIError );
            }
        } );

        console.log( "Loading SpaceAPI for", camDirectory[ _nSpace ].name );

        xhr.withCredentials = !!_withCredentials;
        xhr.open( "GET", camDirectory[ _nSpace ].URI, true );
        xhr.send( null );
    }

    function camBackward( _bSameSpace )
    {
        // Directory must be loaded
        if ( !camDirectory )
            return false;

        updateCamLabel( messages.Loading );

        determineSpaceData( false, function( _space )
        {
            if ( --nCurrentCam < 0 )
            {
                if ( !_bSameSpace )
                {
                    if ( --nCurrentSpace < 0 )
                    {
                        nCurrentSpace = camDirectory.length - 1;
                    }
                }
            }

            // Space might have change, determine again
            determineSpaceData( false, function( _space )
            {
                // We have the cam info, set the current cam
                if ( nCurrentCam < 0 )
                    nCurrentCam = _space.cam.length - 1;

                switchCam( _space.cam[ nCurrentCam ] );

                // If we're on the first cam, preload the previous SpaceAPI
                if ( nCurrentCam === 0 )
                    loadSpaceAPI( nCurrentSpace - 1, null );
            } );
        } );
    }

    function camForward( _bSameSpace )
    {
        // Directory must be loaded
        if ( !camDirectory )
            return false;

        updateCamLabel( messages.Loading );

        determineSpaceData( true, function( _space )
        {
            if ( ++nCurrentCam >= _space.cam.length )
            {
                nCurrentCam = 0;

                if ( !_bSameSpace )
                {
                    if ( ++nCurrentSpace >= camDirectory.length )
                        nCurrentSpace = 0;
                }
            }

            // Space might have change, determine again
            determineSpaceData( true, function( _space )
            {
                switchCam( _space.cam[ nCurrentCam ] );

                // If we're on the last cam, preload the next SpaceAPI
                if ( nCurrentCam >= _space.cam.length - 1 )
                    loadSpaceAPI( nCurrentSpace + 1, null );
            } );
        } );
    }

    function switchCam( _strURI, _bSilent, _strLabel )
    {
        if ( !_bSilent )
        {
            camSwitchSound.pause();
            camSwitchSound.currentTime = 0;
            camSwitchSound.play();
        }

        // Enable image and hide the static
        updateBackGround( false, bZoom, _bSilent ? null : "none" );

        activeCamURI = null;

        if ( m_img )
        {
            m_img.onerror = null;
            m_img.onload = null;
            m_img.src = null;
        }
        else
        {
            m_img = new Image();
        }


        var strCamLabel;
        if ( _strLabel )
        {
            strCamLabel = _strLabel
        }
        else
        {
            strCamLabel = camDirectory[ nCurrentSpace ].name;
            if ( camDirectory[ nCurrentSpace ].cam.length > 1 )
                strCamLabel += " " + ( nCurrentCam + 1 );
        }

        updateCamLabel( messages.CamLoadPrefix + strCamLabel );

        m_img.onload = function( _evt )
        {
            activeCamURI = _evt.target.src;

            updateCamLabel( strCamLabel );

            updateBackGround( false, bZoom, "url('" + activeCamURI + "')" );
        };

        m_img.onerror = function()
        {
            // Show the static again
            console.warn( "could not load image" );
            switchCamOff( );

            // Differentiate failure from 'cam off'
            activeCamURI = false;
            updateCamLabel( messages.CamFailPrefix + strCamLabel );
        };

        // Load the image
        m_img.src = _strURI + "?" + new Date().getTime();
    }

    function updateCamLabel( _strLabel )
    {
        var camName = document.getElementById( "camName" );

        if ( bDebug )
        {
            if ( nCurrentSpace >= 0 )
            {
                var message = ( camDirectory[ nCurrentSpace ].state.message || null );
                if ( message )
                {
                    message = 'font-weight:bold;">' + message + "";
                }
                _strLabel += '<br/>State: <span style="';
                if ( camDirectory[ nCurrentSpace ].state.open )
                {
                    _strLabel += "color: green;" + ( message || '">open' );
                }
                else if ( camDirectory[ nCurrentSpace ].state.open === false )
                {
                    _strLabel += "color: red;" + ( message || '">closed' );
                }
                else
                {
                    _strLabel += "color: orange;" + ( message || '">unknown' );
                }
                _strLabel += '</span>';

                _strLabel += '<br/>Cam URI: <a target="_blank" href="' + camDirectory[ nCurrentSpace ].cam[ nCurrentCam ] + '">';
                if ( activeCamURI === false )
                    _strLabel += "<s>";
                _strLabel += camDirectory[ nCurrentSpace ].cam[ nCurrentCam ];
                _strLabel += "</a>";
                if ( activeCamURI === false )
                    _strLabel += "</s>";

                if ( activeCamURI === null )
                    _strLabel += "..";

                _strLabel += "<br/>Cam: " + ( nCurrentCam + 1 ) + " of " + camDirectory[ nCurrentSpace ].cam.length;
                _strLabel += "<br/>Mode: " + ( bZoom ? "cover" : "fit" );
                _strLabel += '<br/>Space URI <a target="_blank" href="' + camDirectory[ nCurrentSpace ].URI + '">' + camDirectory[ nCurrentSpace ].URI + "</a>";
                _strLabel += "<br/>Space " + ( nCurrentSpace + 1 ) + " of " + camDirectory.length;
            } else {
                _strLabel += "<br/>no current space initialized";
            }
            _strLabel += '<br/><a href="#" onclick="showBookmarks();">bookmarks</a>';

            camName.innerHTML = _strLabel;
        }
        else
        {
            camName.innerText = _strLabel;
        }
    }

    window.setBookmark = function( _nBookmark, _nSpace, _nCam, _strURI, _strName )
    {
        arrBookmarks[ _nBookmark ] = { "CurrentSpace" : _nSpace, "CurrentCam" : _nCam };

        // Special case: if we don't have a name, but we have a space in the URI, split it and set URI+name
        if ( _strURI && _strURI.indexOf( " " ) !== -1 )
        {
            var arrData = _strURI.split( " " );
            arrBookmarks[ _nBookmark ].URI = arrData.splice( 0, 1 )[ 0 ];
            arrBookmarks[ _nBookmark ].name = arrData.join( " " );
        }
        else if ( _strURI )
            arrBookmarks[ _nBookmark ].URI = _strURI;

        // Optional name (overwites special case)
        if ( _strName )
            arrBookmarks[ _nBookmark ].name = _strName;


        // Store in local storage
        if ( typeof( Storage ) !== "undefined" )
            localStorage.bookmarks = JSON.stringify( arrBookmarks );
    }

    window.showBookmarks = function( )
    {
        var strLabel = "";
        var camName = document.getElementById( "camName" );
        arrBookmarks.forEach( function( _item, _idx )
        {
            if ( !_item )
            {
                strLabel += _idx + ") " + messages.Empty +"<br/>";
                return;
            }

            strLabel += _idx + ") ";

            var URI = _item.URI || null;
            var strSpaceLabel = _item.name || messages.Corrupt;
            var nSpace = -1;
            var nCam = -1;

            if ( camDirectory[ _item.CurrentSpace ] && camDirectory[ _item.CurrentSpace ].cam[ _item.CurrentCam ] )
            {
                nSpace = _item.CurrentSpace;
                nCam = _item.CurrentCam;
                strSpaceLabel = _item.name || camDirectory[ nSpace ].name + "" + ( nCam + 1 );
                URI = URI || camDirectory[ nSpace ].cam[ nCam ];
            }

            if ( URI )
                strLabel += '<a href="#" onclick="setBookmark( ' + _idx + ', ' + nSpace + ', ' + nCam + ', prompt( \'Enter new URI and name\', \'' + URI + " " + strSpaceLabel + '\' ) );">';

            strLabel += strSpaceLabel;

            if ( URI )
                strLabel += '</a>';

            strLabel += "<br/>";
        } );
        camName.innerHTML = strLabel;
    }

    function updateBackGround( _bOff, _bZoom, _strImage )
    {
        bOff = _bOff;
        bZoom = _bZoom;

        // Enable image and hide the static
        var cam = document.getElementById( "cam" );

        var arrClasses = [];
        if ( _bZoom )
            arrClasses.push( "pan" );
        if ( _bOff )
            arrClasses.push( "off" );
        cam.className = arrClasses.join( " " );

        if ( _strImage )
            cam.style.backgroundImage = _strImage;
    }

    function switchCamOff( _strLabel )
    {
        if ( _strLabel )
            updateCamLabel( _strLabel );

        activeCamURI = null;
        generateNoiseImage();
        updateBackGround( true, bZoom, "none" );
    }

    function xhr_onload( _evt )
    {
        try
        {
            // Map { "<space>" : "<URI>" } object to [ { "name" : "<space>", "URI" : "<URI>" ] }
            camDirectory = JSON.parse( _evt.target.responseText );
            camDirectory = Object.keys( camDirectory ).map( function( _item )
            {
                return {
                    "name": _item,
                    "URI" : this[ _item ]
                };
            }, camDirectory );
            switchCamOff( messages.Offline );

            // Preload the first SpaceAPI
            loadSpaceAPI( nCurrentSpace + 1, null );

            // Preload the rest as well
            camDirectory.forEach( function( _space, _nSpace )
            {
                loadSpaceAPI( _nSpace, null, true );
            } );

        } catch( _e ) {
            switchCamOff( messages.ParserError );
        }
    }

    var m_noise = null;
    var m_noiseContext = null;
    var m_pattern;
    var m_noiseImage = null;
    var m_patternContext = null;
    var m_patternSize = null;

    function startNoise()
    {
        m_noise = document.getElementById( 'noise' );      
        m_noiseContext = m_noise.getContext('2d');

        m_pattern = document.createElement('canvas');
        m_patternContext = m_pattern.getContext('2d');
        var cw = m_pattern.width = 100;
        var ch = m_pattern.height = 100;
        m_noiseImage = m_patternContext.createImageData( cw, ch );
        m_patternSize = cw * ch;

        switchCamOff( messages.LoadingDirectory );
    }

    function generateNoiseImage()
    {
        var dd = m_noiseImage.data;
        for ( var p = 0, i = 0; i < m_patternSize; ++i )
        {
            dd[p++] = dd[p++] = dd[p++] = Math.floor(Math.random() * 256);
            dd[p++] = 255;
        }
        m_patternContext.putImageData( m_noiseImage, 0, 0 );

        var world_w, world_h;

        // Resize
        var w = window.innerWidth;
        var h = window.innerHeight;
        world_w = m_noise.width = w / 3 >> 1;
        world_h = m_noise.height = h / 3 >> 1;
        m_noise.style.width = w + 'px';
        m_noise.style.height = h + 'px'; 

        m_noiseContext.fillStyle = m_noiseContext.createPattern( m_pattern, 'repeat' );
        m_noiseContext.fillRect( 0, 0, world_w, world_h );

        // Loop it if we don't have an active camera
        if ( !activeCamURI )
            requestAnimationFrame( generateNoiseImage );
    }

}());

