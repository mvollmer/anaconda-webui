#!/usr/bin/python3
#
# Copyright (C) 2022 Red Hat, Inc.
#
# This program is free software; you can redistribute it and/or modify it
# under the terms of the GNU Lesser General Public License as published by
# the Free Software Foundation; either version 2.1 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public License
# along with this program; If not, see <http://www.gnu.org/licenses/>.


class Installer():
    def __init__(self, browser):
        self.browser = browser

    def begin_installation(self):
        self.browser.set_checked("#installation-review-disk-erase-confirm", True)
        self.browser.click("button:contains('Begin installation')")

    def next(self):
        self.browser.click("button:contains(Next)")

    def open(self):
        self.browser.open("/cockpit/@localhost/anaconda-webui/index.html#/installation-language")

    def wait_current_page(self, page):
        self.browser.wait_js_cond(f'window.location.hash === "#/{page}"')
        self.browser.wait_visible("#" + page + ".pf-m-current")
