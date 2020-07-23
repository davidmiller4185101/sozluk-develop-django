/* global Cookies */
(function () {
    $.ajaxSetup({
        beforeSend (xhr, settings) {
            xhr.setRequestHeader("Content-Type", "application/json");
            if (!(/^http:.*/.test(settings.url) || /^https:.*/.test(settings.url))) {
                // Only send the token to relative URLs i.e. locally.
                xhr.setRequestHeader("X-CSRFToken", Cookies.get("csrftoken"));
            }
        }
    });

    function isValidText (body) {
        return /^[A-Za-z0-9 ğçıöşüĞÇİÖŞÜ#&@()_+=':%/",.!?*~`[\]{}<>^;\\|-]+$/g.test(body.split(/[\r\n]+/).join());
    }

    const entityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;",
        "`": "&#x60;",
        "=": "&#x3D;"
    };

    function notSafe (string) {
        return String(string).replace(/[&<>"'`=/]/g, function (s) {
            return entityMap[s];
        });
    }

    let toastQueue = 0;

    function notify (message, level = "default", initialDelay = 2000, persistent = false) {
        const toastHolder = $(".toast-holder");
        const toastTemplate = `
        <div role="alert" aria-live="assertive" aria-atomic="true" class="toast shadow-sm" data-autohide="${!persistent}">
            <div class="toast-body ${level}">
                <div class="toast-content">
                    <span>${message}</span>
                    ${persistent ? `<button type="button" class="ml-2 close" data-dismiss="toast" aria-label="Kapat"><span aria-hidden="true">&times;</span></button>` : ""}
                </div>
            </div>
        </div>`;

        const toast = $(toastTemplate).prependTo(toastHolder);
        const delay = initialDelay + (toastQueue * 1000);

        $(toast).toast({ delay }).toast("show").on("shown.bs.toast", function () {
            toastQueue += 1;
        }).on("hidden.bs.toast", function () {
            $(this).remove();
            toastQueue -= 1;
        });
    }

    function gqlc (data, failSilently = false, failMessage = "bir şeyler yanlış gitti") {
        // GraphQL call, data -> { query, variables }
        return $.post("/graphql/", JSON.stringify(data)).fail(function () {
            if (!failSilently) {
                notify(failMessage, "error");
            }
        });
    }

    function dictToParameters (dict) {
        const str = [];
        for (const key in dict) {
            // a. check if the property/key is defined in the object itself, not in parent
            // b. check if the key is not empty
            if (Object.prototype.hasOwnProperty.call(dict, key) && dict[key]) {
                str.push(encodeURIComponent(key) + "=" + encodeURIComponent(dict[key]));
            }
        }
        return str.join("&");
    }

    const userIsAuthenticated = $("body").is("#au");
    let userIsMobile = false;
    let lastScrollTop = 0;

    function hideRedundantHeader () {
        const delta = 30;
        const st = $(this).scrollTop();
        const header = $("header.page_header");
        if (Math.abs(lastScrollTop - st) <= delta) {
            return;
        }

        if (st > lastScrollTop) {
            // downscroll code
            $(".sub-nav").css("margin-top", ".75em");
            header.css("top", "-55px").hover(function () {
                $(".sub-nav").css("margin-top", "0");
                header.css("top", "0px");
            });
        } else {
            // upscroll code
            $(".sub-nav").css("margin-top", "0");
            header.css("top", "0px");
        }
        lastScrollTop = st;
    }

    const mql = window.matchMedia("(max-width: 810px)");

    function desktopView () {
        userIsMobile = false;

        // Find left frame scroll position.
        if (parseInt(localStorage.getItem("where")) > 0) {
            $("#left-frame-nav").scrollTop(localStorage.getItem("where"));
        }

        // Restore header.
        window.removeEventListener("scroll", hideRedundantHeader);
        $(".sub-nav").css("margin-top", "0");
        $("header.page_header").css("top", "0px");

        // Code to render swh references properly (reverse)
        $("a[data-sup]").each(function () {
            $(this).html(`*`);
        });
    }

    function mobileView () {
        userIsMobile = true;
        // Code to hide some part of the header on mobile scroll.
        window.addEventListener("scroll", hideRedundantHeader);

        // Code to render swh references properly
        $("a[data-sup]").each(function () {
            $(this).html(`<sup>${$(this).attr("data-sup")}</sup>`);
        });
    }

    function mqlsw (mql) {
        // check mql & switch
        if (mql.matches) {
            mobileView();
        } else {
            desktopView();
        }
    }

    // Safari doesn't support mql.addEventListener yet, so we have
    // to use deprecated addListener.
    mql.addListener(mqlsw);

    $(function () {
        // DOM ready.
        mqlsw(mql);

        // Handles notifications passed by django's message framework.
        const requestMessages = $("#request-messages");
        if (requestMessages.attr("data-has-messages") === "true") {
            let delay = 2000;
            for (const message of requestMessages.children("li")) {
                const isPersistent = $(message).attr("data-extra").includes("persistent");
                notify($(message).attr("data-message"), $(message).attr("data-level"), delay, isPersistent);
                delay += 1000;
            }
        }
    });

    $("#header_search").autocomplete({
        triggerSelectOnValidInput: false,
        showNoSuggestionNotice: true,
        noSuggestionNotice: "-- buna yakın bir sonuç yok --",
        appendTo: ".header-search-form",

        lookup (lookup, done) {
            if (lookup.startsWith("@") && lookup.substr(1)) {
                gqlc({
                    query: `query($lookup:String!){autocomplete{authors(lookup:$lookup){username}}}`,
                    variables: { lookup: lookup.substr(1) }
                }).then(function (response) {
                    done({ suggestions: response.data.autocomplete.authors.map(user => ({ value: `@${user.username}` })) });
                });
            } else {
                gqlc({
                    query: `query($lookup:String!){autocomplete{authors(lookup:$lookup,limit:3){username}topics(lookup:$lookup,limit:7){title}}}`,
                    variables: { lookup }
                }).then(function (response) {
                    const topicSuggestions = response.data.autocomplete.topics.map(topic => ({ value: topic.title }));
                    const authorSuggestions = response.data.autocomplete.authors.map(user => ({ value: `@${user.username}` }));
                    done({ suggestions: topicSuggestions.concat(authorSuggestions) });
                });
            }
        },

        onSelect (suggestion) {
            window.location = "/topic/?q=" + suggestion.value;
        }
    });

    for (const item of $(".author-search")) {
        $(item).autocomplete({
            appendTo: $(item).parent(".form-group"),

            lookup (lookup, done) {
                gqlc({
                    query: `query($lookup:String!){autocomplete{authors(lookup:$lookup){username}}}`,
                    variables: { lookup }
                }).then(function (response) {
                    done({ suggestions: response.data.autocomplete.authors.map(user => ({ value: user.username })) });
                });
            },

            onSelect (suggestion) {
                $(this).val(suggestion.value);
            }
        });
    }

    class LeftFrame {
        constructor (slug, page = 1, year = null, searchKeys = null, refresh = false, tab = null, exclusions = null, extra = null) {
            this.slug = slug;
            this.page = page;
            this.year = year;
            this.refresh = refresh;
            this.searchKeys = searchKeys;
            this.tab = tab;
            this.exclusions = exclusions;
            this.extra = extra;

            this.setCookies();
            this.loadIndicator = $("#load_indicator");
        }

        setCookies () {
            Cookies.set("active_category", this.slug);
            Cookies.set("navigation_page", this.page);

            if (this.tab) {
                Cookies.set("active_tab", this.tab);
            } else {
                this.tab = Cookies.get("active_tab") || null;
            }

            if (this.extra) {
                Cookies.set("extra", this.extra);
            } else {
                this.extra = Cookies.get("extra") || null;
            }

            if (this.slug === "today-in-history") {
                const cookieYear = Cookies.get("selected_year");
                if (!this.year) {
                    this.year = cookieYear || null;
                } else {
                    Cookies.set("selected_year", this.year);
                }
            } else if (this.slug === "search") {
                const cookieSearchKeys = Cookies.get("search_parameters");
                if (!this.searchKeys) {
                    this.searchKeys = cookieSearchKeys || null;
                } else {
                    Cookies.set("search_parameters", this.searchKeys);
                }
            } else if (this.slug === "popular") {
                const cookieExclusions = JSON.parse(Cookies.get("exclusions") || "[]");
                if (this.exclusions) {
                    if (cookieExclusions) {
                        for (const exclusion of this.exclusions) {
                            if (cookieExclusions.includes(exclusion)) {
                                this.exclusions = cookieExclusions.filter(item => item !== exclusion);
                            } else {
                                cookieExclusions.push(exclusion);
                                this.exclusions = cookieExclusions;
                            }
                        }
                    }
                    Cookies.set("exclusions", JSON.stringify(this.exclusions));
                } else {
                    this.exclusions = cookieExclusions || null;
                }
            }
        }

        call () {
            this.loadIndicator.css("display", "inline");
            const variables = {
                slug: this.slug,
                year: this.year,
                page: this.page,
                searchKeys: this.searchKeys,
                refresh: this.refresh,
                tab: this.tab,
                exclusions: this.exclusions,
                extra: this.extra
            };

            const query = `query($slug: String!,$year:Int,$page:Int,$searchKeys:String,$refresh:Boolean,$tab:String,
            $exclusions:[String],$extra:JSONString){topics(slug:$slug,year:$year,page:$page,searchKeys:$searchKeys,
            refresh:$refresh,tab:$tab,exclusions:$exclusions,extra:$extra){
                safename refreshCount year yearRange slugIdentifier parameters
                page { objectList { slug title count } paginator { pageRange numPages } number hasOtherPages }
                tabs{current available{name, safename}}
                exclusions{active, available{name, slug, description}}
            }}`;

            const self = this;

            gqlc({ query, variables }).then(function (response) {
                if (response.errors) {
                    self.loadIndicator.css("display", "none");
                    notify("bir şeyler yanlış gitti", "error");
                } else {
                    self.render(response.data.topics);
                }
            }, function () {
                self.loadIndicator.css("display", "none");
            });
        }

        render (data) {
            $("#left-frame-nav").scrollTop(0);
            $("#current_category_name").text(data.safename);
            this.renderRefreshButton(data.refreshCount);
            this.renderYearSelector(data.year, data.yearRange);
            this.renderPagination(data.page.hasOtherPages, data.page.paginator.pageRange, data.page.paginator.numPages, data.page.number);
            this.renderTopicList(data.page.objectList, data.slugIdentifier, data.parameters);
            this.renderShowMoreButton(data.page.number, data.page.hasOtherPages);
            this.renderTabs(data.tabs);
            this.renderExclusions(data.exclusions);
            this.loadIndicator.css("display", "none");
        }

        renderRefreshButton (count) {
            const refreshButton = $("#refresh_bugun");
            if (count) {
                refreshButton.removeClass("dj-hidden");
                $("span#new_content_count").text(`(${count})`);
            } else {
                refreshButton.addClass("dj-hidden");
            }
        }

        renderShowMoreButton (currentPage, isPaginated) {
            const showMoreButton = $("a#show_more");

            if (currentPage !== 1 || !isPaginated) {
                showMoreButton.addClass("dj-hidden");
            } else {
                showMoreButton.removeClass("dj-hidden");
            }
        }

        renderTabs (tabData) {
            const tabHolder = $("ul#left-frame-tabs");
            if (tabData) {
                tabHolder.html("");
                const availableTabs = tabData.available;
                const current = tabData.current;
                for (const tab of availableTabs) {
                    tabHolder.append(`<li class="nav-item"><a role="button" tabindex="0" data-lf-slug="${this.slug}" data-tab="${tab.name}" class="nav-link${current === tab.name ? " active" : ""}">${tab.safename}</a></li>`);
                }
                tabHolder.removeClass("dj-hidden");
            } else {
                tabHolder.addClass("dj-hidden");
            }
        }

        renderExclusions (exclusions) {
            const toggler = $("#gundem_excluder");
            const categoryHolder = $("#exlusion-choices");
            const categoryList = categoryHolder.children("ul.exlusion-choices");

            if (exclusions) {
                categoryList.empty();
                toggler.removeClass("dj-hidden");

                for (const category of exclusions.available) {
                    const isActive = exclusions.active.includes(category.slug);
                    categoryList.append(`<li><a role="button" title="${category.description}" ${isActive ? `class="active"` : ""} tabindex="0" data-slug="${category.slug}">#${category.name}</a></li>`);
                }
            } else {
                toggler.addClass("dj-hidden");
                categoryHolder.hide();
            }
        }

        renderYearSelector (currentYear, yearRange) {
            const yearSelect = $("#year_select");
            yearSelect.html("");

            if (this.slug === "today-in-history") {
                yearSelect.css("display", "block");
                for (const year of yearRange) {
                    yearSelect.append(`<option ${year === currentYear ? "selected" : ""} id="${year}">${year}</option>`);
                }
            } else {
                yearSelect.css("display", "none");
            }
        }

        renderTopicList (objectList, slugIdentifier, parameters) {
            const topicList = $("ul#topic-list");
            if (objectList.length === 0) {
                topicList.html(`<small>yok ki</small>`);
            } else {
                topicList.empty();
                const params = parameters || "";

                for (const topic of objectList) {
                    topicList.append(`<li class="list-group-item"><a href="${slugIdentifier}${topic.slug}/${params}">${notSafe(topic.title)}<small class="total_entries">${topic.count && topic.count !== "0" ? topic.count : ""}</small></a></li>`);
                }
            }
        }

        renderPagination (isPaginated, pageRange, totalPages, currentPage) {
            // Pagination related selectors
            const paginationWrapper = $("#lf_pagination_wrapper");
            const pageSelector = $("select#left_frame_paginator");
            const totalPagesButton = $("#lf_total_pages");

            // Render pagination
            if (isPaginated && currentPage !== 1) {
                // Render Page selector
                pageSelector.empty();
                for (const page of pageRange) {
                    pageSelector.append($("<option>", {
                        value: page,
                        text: page,
                        selected: page === currentPage
                    }));
                }
                totalPagesButton.text(totalPages); // Last page
                paginationWrapper.removeClass("dj-hidden"); // Show it
            } else {
                paginationWrapper.addClass("dj-hidden");
            }
        }

        static populate (slug, page = 1, ...args) {
            if (userIsMobile) {
                return;
            }
            const leftFrame = new LeftFrame(slug, page, ...args);
            leftFrame.call();
        }

        static refreshPopulate () {
            LeftFrame.populate("today", 1, null, null, true);
        }
    }

    /* Start of LefFrame related triggers */

    $("body").on("click", "[data-lf-slug]", function (event) {
        // Regular, slug-only
        if (!userIsMobile) {
            const slug = $(this).attr("data-lf-slug");
            const tab = $(this).attr("data-tab") || null;
            const extra = $(this).attr("data-lf-extra") || null;
            LeftFrame.populate(slug, 1, null, null, false, tab, null, extra);

            if ($(this).hasClass("dropdown-item")) {
                // Prevents dropdown collapsing, good for accessibility.
                return false;
            } else {
                event.preventDefault();
            }
        }
    });

    $("#year_select").on("change", function () {
        // Year is changed
        const selectedYear = this.value;
        LeftFrame.populate("today-in-history", 1, selectedYear);
    });

    $("select#left_frame_paginator").on("change", function () {
        // Page is changed
        LeftFrame.populate(Cookies.get("active_category"), this.value);
    });

    $("#lf_total_pages").on("click", function () {
        // Navigated to last page
        $("select#left_frame_paginator").val($(this).text()).trigger("change");
    });

    $("#lf_navigate_before").on("click", function () {
        // Previous page
        const lfSelect = $("select#left_frame_paginator");
        const selected = parseInt(lfSelect.val());
        if (selected - 1 > 0) {
            lfSelect.val(selected - 1).trigger("change");
        }
    });

    $("#lf_navigate_after").on("click", function () {
        // Subsequent page
        const lfSelect = $("select#left_frame_paginator");
        const selected = parseInt(lfSelect.val());
        const max = parseInt($("#lf_total_pages").text());
        if (selected + 1 <= max) {
            lfSelect.val(selected + 1).trigger("change");
        }
    });

    $("a#show_more").on("click", function () {
        // Show more button event
        const slug = Cookies.get("active_category");

        if (slug) {
            LeftFrame.populate(slug, 2);
        }

        $(this).addClass("dj-hidden");
    });

    $("#refresh_bugun").on("click", function () {
        LeftFrame.refreshPopulate();
    });

    $(".exclusion-button").on("click", function () {
        $(this).closest("div").siblings(".exclusion-settings").toggle(250);
    });

    $("#exlusion-choices").on("click", "ul li a", function () {
        $(this).toggleClass("active");
        LeftFrame.populate("popular", 1, null, null, null, null, [$(this).attr("data-slug")]);
    });

    $("#exclusion-settings-mobile").on("click", "ul li a", function () {
        const slug = $(this).attr("data-slug");
        const excludeParam = new URLSearchParams(window.location.search).get("exclude");
        let exclusions;

        if (excludeParam) {
            exclusions = excludeParam.split(",");
        } else {
            exclusions = [];
        }

        if (exclusions.includes(slug)) {
            exclusions = exclusions.filter(item => item !== slug);
        } else {
            exclusions.push(slug);
        }

        const exclude = exclusions.join(",");

        if (exclude) {
            window.location.replace("?exclude=" + exclude);
        } else {
            window.location.replace(window.location.href.split("?")[0]);
        }
    });

    /* End of LefFrame related triggers */

    $("[data-lf-slug]").on("click", function () {
        // Visual guidance for active category
        $("[data-lf-slug]").removeClass("active");
        $(`[data-lf-slug=${$(this).attr("data-lf-slug")}]`).addClass("active");
    });

    // https://stackoverflow.com/questions/5999118/how-can-i-add-or-update-a-query-string-parameter
    function updateQueryStringParameter (uri, key, value) {
        const re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
        const separator = uri.indexOf("?") !== -1 ? "&" : "?";
        if (uri.match(re)) {
            return uri.replace(re, "$1" + key + "=" + value + "$2");
        } else {
            return uri + separator + key + "=" + value;
        }
    }

    $("select.page-selector").on("change", function () {
        window.location = updateQueryStringParameter(location.href, "page", this.value);
    });

    jQuery.fn.extend({
        insertAtCaret (myValue) {
            return this.each(function () {
                if (document.selection) {
                    // Internet Explorer
                    this.focus();
                    const sel = document.selection.createRange();
                    sel.text = myValue;
                    this.focus();
                } else if (this.selectionStart || this.selectionStart === "0") {
                    // For browsers like Firefox and Webkit based
                    const startPos = this.selectionStart;
                    const endPos = this.selectionEnd;
                    const scrollTop = this.scrollTop;
                    this.value = this.value.substring(0, startPos) + myValue + this.value.substring(endPos, this.value.length);
                    this.focus();
                    this.selectionStart = startPos + myValue.length;
                    this.selectionEnd = startPos + myValue.length;
                    this.scrollTop = scrollTop;
                } else {
                    this.value += myValue;
                    this.focus();
                }
            });
        },
        toggleText (a, b) {
            return this.text(this.text() === b ? a : b);
        }

    });

    function replaceText (elementId, replacementType) {
        const txtarea = document.getElementById(elementId);
        const start = txtarea.selectionStart;
        const finish = txtarea.selectionEnd;
        const allText = txtarea.value;
        const sel = allText.substring(start, finish);
        if (!sel) {
            return false;
        } else {
            if (replacementType === "bkz") {
                txtarea.value = allText.substring(0, start) + `(bkz: ${sel})` + allText.substring(finish, allText.length);
            } else if (replacementType === "hede") {
                txtarea.value = allText.substring(0, start) + `\`${sel}\`` + allText.substring(finish, allText.length);
            } else if (replacementType === "swh") {
                txtarea.value = allText.substring(0, start) + `\`:${sel}\`` + allText.substring(finish, allText.length);
            } else if (replacementType === "spoiler") {
                txtarea.value = allText.substring(0, start) + `--\`spoiler\`--\n${sel}\n--\`spoiler\`--` + allText.substring(finish, allText.length);
            } else if (replacementType === "link") {
                const linkText = prompt("hangi adrese gidecek?", "http://");
                if (linkText !== "http://") {
                    txtarea.value = allText.substring(0, start) + `[${linkText} ${sel}]` + allText.substring(finish, allText.length);
                }
            }
            return true;
        }
    }

    $("button#insert_bkz").on("click", function () {
        if (!replaceText("user_content_edit", "bkz")) {
            const bkzText = prompt("bkz verilecek başlık, #entry veya @yazar");
            if (bkzText) {
                $("textarea#user_content_edit").insertAtCaret(`(bkz: ${bkzText})`);
            }
        }
    });

    $("button#insert_hede").on("click", function () {
        if (!replaceText("user_content_edit", "hede")) {
            const hedeText = prompt("hangi başlık veya #entry için link oluşturulacak?");
            if (hedeText) {
                $("textarea#user_content_edit").insertAtCaret(`\`${hedeText}\``);
            }
        }
    });

    $("button#insert_swh").on("click", function () {
        if (!replaceText("user_content_edit", "swh")) {
            const swhText = prompt("yıldız içinde ne görünecek?");
            if (swhText) {
                $("textarea#user_content_edit").insertAtCaret(`\`:${swhText}\``);
            }
        }
    });

    $("button#insert_spoiler").on("click", function () {
        if (!replaceText("user_content_edit", "spoiler")) {
            const spoilerText = prompt("spoiler arasına ne yazılacak?");
            if (spoilerText) {
                $("textarea#user_content_edit").insertAtCaret(`--\`spoiler\`--\n${spoilerText}\n--\`spoiler\`--`);
            }
        }
    });

    $("button#insert_link").on("click", function () {
        if (!replaceText("user_content_edit", "link")) {
            const linkText = prompt("hangi adrese gidecek?", "http://");
            if (linkText && linkText !== "http://") {
                const linkName = prompt(" verilecek linkin adı ne olacak?");
                if (linkName) {
                    $("textarea#user_content_edit").insertAtCaret(`[${linkText} ${linkName}]`);
                }
            }
        }
    });

    $("a.favorite[role='button']").on("click", function () {
        const self = $(this);
        const pk = $(self).parents(".entry-full").attr("data-id");

        gqlc({ query: `mutation{entry{favorite(pk:"${pk}"){feedback count}}}` }).then(function (response) {
            const count = response.data.entry.favorite.count;
            const countHolder = self.next();

            self.toggleClass("active");
            countHolder.text(count);

            if (count === 0) {
                countHolder.text("");
            }

            self.siblings("span.favorites-list").attr("data-loaded", "false");
        });
    });

    $(document).on("click", "footer.entry-footer > .feedback > .favorites .dropdown-menu, .dropdown-advanced-search, .autocomplete-suggestions", e => {
        e.stopPropagation();
    });

    $(".dropdown-advanced-search > div > a.search-closer").on("click", function () {
        $(".dropdown-advanced-search").removeClass("show");
    });

    $("a.fav-count[role='button']").on("click", function () {
        const self = $(this);
        const favoritesList = self.next();

        if (favoritesList.attr("data-loaded") === "true") {
            return;
        }

        const pk = self.closest(".entry-full").attr("data-id");

        gqlc({ query: `{entry{favoriters(pk:${pk}){username slug isNovice}}}` }).then(function (response) {
            const allUsers = response.data.entry.favoriters;
            const authors = allUsers.filter(user => user.isNovice === false);
            const novices = allUsers.filter(user => user.isNovice === true);

            favoritesList.html("");
            favoritesList.attr("data-loaded", "true");

            if (!allUsers.length) {
                favoritesList.html("<span class='p-2'>hiç yok aslında</span>");
                return;
            }

            if (authors.length > 0) {
                for (const author of authors) {
                    favoritesList.append(`<a class="author" href="/author/${author.slug}/">@${author.username}</a>`);
                }
            }

            if (novices.length > 0) {
                favoritesList.append(`<a id="show_novice_button" role="button" tabindex="0">... ${novices.length} çaylak</a><span class="dj-hidden" id="favorites_list_novices"></span>`);

                $("a#show_novice_button").on("click", function () {
                    $("#favorites_list_novices").toggleClass("dj-hidden");
                });

                for (const novice of novices) {
                    $("#favorites_list_novices").append(`<a class="novice" href="/author/${novice.slug}/">@${novice.username}</a>`);
                }
            }
        });
    });

    $("a#message_history_show").on("click", function () {
        $("ul#message_list li.bubble").css("display", "list-item");
        $(this).toggle();
    });

    function userAction (type, recipient, loc = null, re = true) {
        gqlc({ query: `mutation{user{${type}(username:"${recipient}"){feedback redirect}}}` }).then(function (response) {
            const info = response.data.user[type];
            if (re && (loc || info.redirect)) {
                window.location = loc || info.redirect;
            } else {
                notify(info.feedback);
            }
        });
    }

    function showBlockDialog (recipient, redirect = true) {
        $("#block_user").attr("data-username", recipient).attr("data-re", redirect);
        $("#username-holder").text(recipient);
        $("#blockUserModal").modal("show");
    }

    function showMessageDialog (recipient, extraContent) {
        const msgModal = $("#sendMessageModal");
        $("#sendMessageModal span.username").text(recipient);
        $("#sendMessageModal textarea#message_body").val(extraContent);
        msgModal.attr("data-for", recipient);
        msgModal.modal("show");
    }

    $(".entry-actions").on("click", ".block-user-trigger", function () {
        const target = $(this).parent().siblings(".username").text();
        const re = $(".profile-username").text() === target;
        showBlockDialog(target, re);
    });

    $("#block_user").on("click", function () {
        // Modal button click event
        const targetUser = $(this).attr("data-username");
        const re = $(this).attr("data-re") === "true";
        if (!re) {
            $(".entry-full").each(function () {
                if ($(this).find(".meta .username").text() === targetUser) {
                    $(this).remove();
                }
            });
        }
        userAction("block", targetUser, null, re);
        $("#blockUserModal").modal("hide");
    });

    $(".unblock-user-trigger").on("click", function () {
        if (confirm("emin misiniz?")) {
            let loc;
            if ($(this).hasClass("sync")) {
                loc = location;
            } else {
                $(this).hide();
            }
            userAction("block", $(this).attr("data-username"), loc);
        }
    });

    $(".follow-user-trigger").on("click", function () {
        const targetUser = $(this).parent().attr("data-username");
        userAction("follow", targetUser);
        $(this).children("a").toggleText("takip et", "takip etme");
    });

    function entryAction (type, pk, redirect = false) {
        return gqlc({ query: `mutation{entry{${type}(pk:"${pk}"){feedback ${redirect ? "redirect" : ""}}}}` });
    }

    $("a.twitter[role='button'], a.facebook[role='button']").on("click", function () {
        const base = $(this).hasClass("twitter") ? "https://twitter.com/intent/tweet?text=" : "https://www.facebook.com/sharer/sharer.php?u=";
        const entry = $(this).closest(".feedback").siblings(".meta").children("a.permalink").attr("href");
        window.open(`${base}${window.location.origin}${entry}`, "_blank", "noopener");
    });

    $(".entry-vote .vote").on("click", function () {
        const self = $(this);
        const type = self.hasClass("upvote") ? "upvote" : "downvote";
        const entryId = self.parents(".entry-full").attr("data-id");
        entryAction(type, entryId).then(function (response) {
            const feedback = response.data.entry[type].feedback;
            if (feedback == null) {
                self.siblings(".vote").removeClass("active");
                self.toggleClass("active");
            } else {
                notify(feedback, "error", 4000);
            }
        });
    });

    $(".comment-vote .vote").on("click", function () {
        const self = $(this);
        const action = self.hasClass("upvote") ? "upvote" : "downvote";
        const pk = self.parent().attr("data-id");
        gqlc({
            query: "mutation($pk:ID!,$action:String!){entry{votecomment(pk:$pk,action:$action){count}}}",
            variables: { pk, action }
        }).then(function (response) {
            if (response.errors) {
                for (const error of response.errors) {
                    notify(error.message, "error");
                }
                return;
            }
            self.siblings(".vote").removeClass("active");
            self.toggleClass("active");
            self.siblings(".rating").text(response.data.entry.votecomment.count);
        });
    });

    $(".entry-actions").on("click", ".delete-entry", function () {
        if (confirm("harbiden silinsin mi?")) {
            const entry = $(this).parents(".entry-full");
            const redirect = $("ul.topic-view-entries li.entry-full").length === 1;

            entryAction("delete", entry.attr("data-id"), redirect).then(function (response) {
                const data = response.data.entry.delete;
                if (redirect) {
                    window.location = data.redirect;
                } else {
                    entry.remove();
                    notify(data.feedback);
                }
            });
        }
    });

    $(".delete-entry-redirect").on("click", function () {
        if (confirm("harbiden silinsin mi?")) {
            entryAction("delete", $(this).attr("data-target-entry"), true).then(function (response) {
                window.location = response.data.entry.delete.redirect;
            });
        }
    });

    $(".entry-actions").on("click", ".pin-entry", function () {
        const entryID = $(this).parents(".entry-full").attr("data-id");
        const body = $("body");
        entryAction("pin", entryID).then(function (response) {
            notify(response.data.entry.pin.feedback);
            $("a.action[role='button']").removeClass("loaded");
            if (body.attr("data-pin") === entryID) {
                body.removeAttr("data-pin");
            } else {
                body.attr("data-pin", entryID);
            }
        });
    });

    $(".pin-sync").on("click", function () {
        entryAction("pin", $(this).attr("data-id")).then(function (response) {
            notify(response.data.entry.pin.feedback);
            window.location = location;
        });
    });

    function topicAction (type, pk) {
        return gqlc({ query: `mutation{topic{${type}(pk:"${pk}"){feedback}}}` }).then(function (response) {
            notify(response.data.topic[type].feedback);
        });
    }

    $(".follow-topic-trigger").on("click", function () {
        $(this).toggleText("takip etme", "takip et");
        topicAction("follow", $(this).attr("data-topic-id"));
    });

    $("select#mobile_year_changer").on("change", function () {
        window.location = updateQueryStringParameter(location.href, "year", this.value);
    });

    $.fn.overflown = function () {
        const e = this[0];
        return e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth;
    };

    function truncateEntryText () {
        for (const element of $("article.entry p")) {
            if ($(element).overflown()) {
                $(element).parent().append(`<div role="button" tabindex="0" class="read_more">devamını okuyayım</div>`);
            }
        }
    }

    window.onload = function () {
        if ($("body").hasClass("has-entries")) {
            truncateEntryText();
            $("div.read_more").on("click", function () {
                $(this).siblings("p").css("max-height", "none");
                $(this).hide();
            });
        }
    };

    function populateSearchResults (searchParameters) {
        if (!searchParameters) {
            return;
        }

        const slug = "search";

        if (userIsMobile) {
            window.location = `/threads/${slug}/?${searchParameters}`;
        }
        LeftFrame.populate(slug, 1, null, searchParameters);
    }

    $("button#perform_advanced_search").on("click", function () {
        const keywords = $("input#keywords_dropdown").val();
        const authorNick = $("input#author_nick_dropdown").val();
        const isNiceOnes = $("input#nice_ones_dropdown").is(":checked");
        const isFavorites = $("input#in_favorites_dropdown").is(":checked");
        const fromDate = $("input#date_from_dropdown").val();
        const toDate = $("input#date_to_dropdown").val();
        const ordering = $("select#ordering_dropdown").val();

        const keys = {
            keywords,
            author_nick: authorNick,
            is_nice_ones: isNiceOnes,
            is_in_favorites: isFavorites,
            from_date: fromDate,
            to_date: toDate,
            ordering
        };
        populateSearchResults(dictToParameters(keys));
    });

    function categoryAction (type, pk) {
        return gqlc({ query: `mutation{category{${type}(pk:"${pk}"){feedback}}}` });
    }

    function composeMessage (recipient, body) {
        const variables = { recipient, body };
        const query = `mutation compose($body:String!,$recipient:String!){message{compose(body:$body,recipient:$recipient){feedback}}}`;
        return gqlc({ query, variables }).then(function (response) {
            notify(response.data.message.compose.feedback);
        });
    }

    $(".entry-actions").on("click", ".send-message-trigger", function () {
        const recipient = $(this).parent().siblings(".username").text();
        const entryInQuestion = $(this).parents(".entry-full").attr("data-id");
        showMessageDialog(recipient, `\`#${entryInQuestion}\` hakkında:\n`);
    });

    $("#send_message_btn").on("click", function () {
        const self = $(this);
        const textarea = $("#sendMessageModal textarea");
        const msgModal = $("#sendMessageModal");
        const body = textarea.val();

        if (!isValidText(body)) {
            notify("bu içerik geçersiz karakterler içeriyor", "error");
            return;
        }

        if (body.length < 3) {
            // not strictly needed but written so as to reduce api calls.
            notify("düzgün bir şeyler yazsan çeşke", "error");
            return;
        }

        self.prop("disabled", true);
        composeMessage(msgModal.attr("data-for"), body).then(function () {
            msgModal.modal("hide");
            textarea.val("");
        }).always(function () {
            self.prop("disabled", false);
        });
    });

    $("button.follow-category-trigger").on("click", function () {
        const self = $(this);
        categoryAction("follow", $(this).data("category-id")).then(function () {
            self.toggleText("bırak ya", "takip et");
            self.toggleClass("faded");
        });
    });

    $("form.search_mobile, form.reporting-form").submit(function () {
        const emptyFields = $(this).find(":input").filter(function () {
            return $(this).val() === "";
        });
        emptyFields.prop("disabled", true);
        return true;
    });

    $("body").on("keypress", "[role=button], .key-clickable", function (e) {
        if (e.which === 13 || e.which === 32) { // space or enter
            $(this).click();
        }
    });

    $("a[role=button].quicksearch").on("click", function () {
        const term = $(this).attr("data-keywords");
        let parameter;
        if (term.startsWith("@") && term.substr(1)) {
            parameter = `author_nick=${term.substr(1)}`;
        } else {
            parameter = `keywords=${term}`;
        }
        const searchParameters = parameter + "&ordering=newer";
        populateSearchResults(searchParameters);
    });

    $("#left-frame-nav").scroll(function () {
        localStorage.setItem("where", $(this).scrollTop());
    });

    $(".entry-full a.action[role='button']").on("click", function () {
        const self = $(this);
        if (self.hasClass("loaded")) {
            return;
        }

        const entry = self.parents(".entry-full");
        const entryID = entry.attr("data-id");
        const topicTitle = encodeURIComponent(entry.closest("[data-topic]").attr("data-topic"));
        const actions = self.siblings(".entry-actions");
        const pinLabel = entryID === $("body").attr("data-pin") ? "profilimden kaldır" : "profilime sabitle";

        actions.empty();

        if (userIsAuthenticated) {
            if (entry.hasClass("commentable")) {
                actions.append(`<a target="_blank" href="/entry/${entryID}/comment/" class="dropdown-item">yorum yap</a>`);
            }
            if (entry.hasClass("owner")) {
                actions.append(`<a role="button" tabindex="0" class="dropdown-item pin-entry">${pinLabel}</a>`);
                actions.append(`<a role="button" tabindex="0" class="dropdown-item delete-entry">sil</a>`);
                actions.append(`<a href="/entry/update/${entryID}/" class="dropdown-item">düzelt</a>`);
            } else {
                if (!entry.hasClass("private")) {
                    actions.append(`<a role="button" tabindex="0" class="dropdown-item send-message-trigger">mesaj gönder</a>`);
                    actions.append(`<a role="button" tabindex="0" class="dropdown-item block-user-trigger">engelle</a>`);
                }
            }
        }

        actions.append(`<a class="dropdown-item" href="/contact/?referrer_entry=${entryID}&referrer_topic=${topicTitle}">şikayet</a>`);
        self.addClass("loaded");
    });

    $("ul.user-links").on("click", "li.block-user a", function () {
        const recipient = $(this).parents(".user-links").attr("data-username");
        showBlockDialog(recipient);
    });

    $("ul.user-links").on("click", "li.send-message a", function () {
        const recipient = $(this).parents(".user-links").attr("data-username");
        showMessageDialog(recipient);
    });

    $(".block-user-trigger").on("click", function () {
        showBlockDialog($(this).attr("data-username"));
    });

    function wishTopic (title, hint = null) {
        const query = `mutation wish($title:String!,$hint:String){topic{wish(title:$title,hint:$hint){feedback hint}}}`;
        const variables = { title, hint };
        return gqlc({ query, variables });
    }

    $("a.wish-prepare[role=button]").on("click", function () {
        $(this).siblings(":not(.wish-purge)").toggle();
        $(this).toggleText("biri bu başlığı doldursun", "boşver");
    });

    $("a.wish-send[role=button]").on("click", function () {
        const self = $(this);
        const textarea = self.siblings("textarea");
        const hint = textarea.val();

        if (hint && !isValidText(hint)) {
            notify("bu içerik geçersiz karakterler içeriyor", "error");
            return;
        }

        const title = self.parents("section").attr("data-topic");
        wishTopic(title, hint).then(function (response) {
            if (response.errors) {
                for (const error of response.errors) {
                    notify(error.message, "error");
                }
                return;
            }
            textarea.val("");
            self.toggle();
            self.siblings().toggle();
            const hintFormatted = response.data.topic.wish.hint;
            $("ul#wish-list").show().prepend(`<li class="list-group-item owner">bu başlığa az önce ukte verdiniz. ${hintFormatted ? `notunuz: <p class="m-0"><i>${hintFormatted.replace(/\n/g, "<br>")}</i></p>` : ""}</li>`);
            $(window).scrollTop(0);
            notify(response.data.topic.wish.feedback);
        });
    });

    $("a.wish-purge[role=button]").on("click", function () {
        const self = $(this);
        const title = self.parents("section").attr("data-topic");
        if (confirm("harbiden silinsin mi?")) {
            wishTopic(title).then(function (response) {
                self.toggle();
                self.siblings(".wish-prepare").text("biri bu başlığı doldursun").toggle();
                $("ul#wish-list").children("li.owner").hide();
                notify(response.data.topic.wish.feedback);
            });
        }
    });

    $(".content-skipper").on("click", function () {
        location.replace($(this).attr("data-href"));
        notify(`seçici <strong>${$(this).attr("data-text-identifier")}</strong> kısımına odaklandı.`);
    });

    $(document).keydown(function (e) {
        if (e.which === 20) {
            $("#skipper-main-menu").focus();
        }
    });

    $("input.is-invalid").on("input", function () {
        $(this).removeClass("is-invalid");
    });

    $("textarea#user_content_edit, textarea#message-body").on("input", function () {
        window.onbeforeunload = () => this.value || null;
    });

    $("form").submit(function () {
        window.onbeforeunload = null;
    });

    // Conversation actions functionality

    $("input.chat-selector").on("change", function () {
        $(this).closest("li.chat").toggleClass("selected");
    });

    $("a[role=button].chat-reverse").on("click", function () {
        $("input.chat-selector").each(function () {
            this.checked = !this.checked;
            $(this).change();
        });
    });

    function getPkSet (selected) {
        const pkSet = [];
        selected.each(function () {
            pkSet.push($(this).attr("data-id"));
        });
        return pkSet;
    }

    function selectChat (init) {
        // inbox.html || conversation.html
        let chat = init.closest("li.chat");
        if (!chat.length) {
            chat = init.parent();
        }
        return chat;
    }

    function deleteConversation (pkSet, mode) {
        const query = `mutation($pkSet:[ID!]!, $mode:String){message{deleteConversation(pkSet:$pkSet,mode:$mode){redirect}}}`;
        const variables = { pkSet, mode };
        return gqlc({ query, variables });
    }

    $("a[role=button].chat-delete-individual").on("click", function () {
        if (!confirm("harbiden silinsin mi?")) {
            return false;
        }

        const chat = selectChat($(this));
        const mode = $("ul.threads").attr("data-mode") || chat.attr("data-mode");

        deleteConversation(chat.attr("data-id"), mode).then(function (response) {
            const data = response.data.message.deleteConversation;
            if (data) {
                if ($("li.chat").length > 1) {
                    chat.remove();
                    notify("silindi");
                } else {
                    window.location = data.redirect;
                }
            }
        });
    });

    $("a[role=button].chat-delete").on("click", function () {
        const selected = $("li.chat.selected");

        if (selected.length) {
            if (!confirm("seçilen sohbetler harbiden silinsin mi?")) {
                return false;
            }

            deleteConversation(getPkSet(selected), $("ul.threads").attr("data-mode")).then(function (response) {
                const data = response.data.message.deleteConversation;
                if (data) {
                    window.location = data.redirect;
                }
            });
        } else {
            notify("silmek için bir sohbet seçmedin ki", "error");
        }
    });

    function archiveConversation (pkSet) {
        const query = `mutation($pkSet:[ID!]!){message{archiveConversation(pkSet:$pkSet){redirect}}}`;
        const variables = { pkSet };
        return gqlc({ query, variables });
    }

    $("a[role=button].chat-archive").on("click", function () {
        const selected = $("li.chat.selected");

        if (selected.length) {
            if (!confirm("seçilen sohbetler harbiden arşivlensin mi?")) {
                return false;
            }

            archiveConversation(getPkSet(selected)).then(function (response) {
                const data = response.data.message.archiveConversation;
                if (data) {
                    window.location = data.redirect;
                }
            });
        } else {
            notify("arşivlemek için bir sohbet seçmedin ki", "error");
        }
    });

    $("a[role=button].chat-archive-individual").on("click", function () {
        if (!confirm("harbiden arşivlensin mi?")) {
            return false;
        }

        const chat = selectChat($(this));

        archiveConversation(chat.attr("data-id")).then(function (response) {
            const data = response.data.message.archiveConversation;
            if (data) {
                if ($("li.chat").length > 1) {
                    chat.remove();
                    notify("arşivlendi");
                } else {
                    window.location = data.redirect;
                }
            }
        });
    });
})();
